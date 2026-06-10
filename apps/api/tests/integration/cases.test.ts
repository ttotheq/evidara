import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import {
  addMember,
  createCaseFixture,
  createOrganization,
  createUser,
  login,
  resetDatabase,
} from "../helpers.js";

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
});

const caseBody = {
  name: "Phishing infrastructure review",
  objective: "Identify infrastructure linked to the reported campaign.",
  scope: "Public DNS, certificate transparency, and passive sources only.",
  justification: "Reported phishing campaign against the organization.",
};

function postCase(
  session: { cookie: Record<string, string>; csrfToken: string },
  organizationId: string,
  overrides: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/v1/cases",
    cookies: session.cookie,
    headers: {
      "x-csrf-token": session.csrfToken,
      "idempotency-key": `test-${Math.random().toString(36).slice(2)}`,
    },
    payload: { ...caseBody, organizationId, ...overrides },
  });
}

describe("case creation authorization", () => {
  it("allows an organization member to create a case and become its owner", async () => {
    const user = await createUser("member@example.test");
    const organization = await createOrganization("acme");
    await addMember(organization.id, user.id, "MEMBER");

    const session = await login(app, "member@example.test");
    const response = await postCase(session, organization.id);

    expect(response.statusCode).toBe(201);
    expect(response.json().data.organizationId).toBe(organization.id);
  });

  it("denies creating a case in an organization the user does not belong to (cross-tenant)", async () => {
    const insider = await createUser("insider@example.test");
    const outsider = await createUser("outsider@example.test");
    const orgA = await createOrganization("org-a");
    const orgB = await createOrganization("org-b");
    await addMember(orgA.id, insider.id, "OWNER");
    await addMember(orgB.id, outsider.id, "OWNER");

    const session = await login(app, "outsider@example.test");
    const response = await postCase(session, orgA.id);

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("denies users with no organization membership", async () => {
    await createUser("drifter@example.test");
    const organization = await createOrganization("acme");

    const session = await login(app, "drifter@example.test");
    const response = await postCase(session, organization.id);

    expect(response.statusCode).toBe(403);
  });

  it("requires a CSRF token", async () => {
    const user = await createUser("member@example.test");
    const organization = await createOrganization("acme");
    await addMember(organization.id, user.id, "MEMBER");

    const session = await login(app, "member@example.test");
    const response = await app.inject({
      method: "POST",
      url: "/v1/cases",
      cookies: session.cookie,
      headers: { "idempotency-key": "test-no-csrf-token" },
      payload: { ...caseBody, organizationId: organization.id },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_REJECTED");
  });

  it("requires an idempotency key", async () => {
    const user = await createUser("member@example.test");
    const organization = await createOrganization("acme");
    await addMember(organization.id, user.id, "MEMBER");

    const session = await login(app, "member@example.test");
    const response = await app.inject({
      method: "POST",
      url: "/v1/cases",
      cookies: session.cookie,
      headers: { "x-csrf-token": session.csrfToken },
      payload: { ...caseBody, organizationId: organization.id },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("case list scoping", () => {
  it("shows only cases the user can see", async () => {
    const owner = await createUser("owner@example.test");
    const member = await createUser("member@example.test");
    const admin = await createUser("admin@example.test");
    const outsider = await createUser("outsider@example.test");

    const organization = await createOrganization("acme");
    const otherOrganization = await createOrganization("other");
    await addMember(organization.id, owner.id, "OWNER");
    await addMember(organization.id, member.id, "MEMBER");
    await addMember(organization.id, admin.id, "ADMIN");
    await addMember(otherOrganization.id, outsider.id, "OWNER");

    const ownersCase = await createCaseFixture({
      organizationId: organization.id,
      createdById: owner.id,
      name: "Owner's internal case",
    });
    const membersRestrictedCase = await createCaseFixture({
      organizationId: organization.id,
      createdById: member.id,
      name: "Member's restricted case",
      handlingLevel: "RESTRICTED",
    });

    const listFor = async (email: string) => {
      const session = await login(app, email);
      const response = await app.inject({
        method: "GET",
        url: "/v1/cases",
        cookies: session.cookie,
      });
      expect(response.statusCode).toBe(200);
      return (response.json().data as Array<{ id: string }>).map(
        (item) => item.id,
      );
    };

    // The member sees only their own case; org-admin oversight does not
    // apply to MEMBER role, and they are not a member of the owner's case.
    expect(await listFor("member@example.test")).toEqual([
      membersRestrictedCase.id,
    ]);

    // The org owner sees their own case via membership but NOT the
    // member's RESTRICTED case, which requires explicit membership.
    expect(await listFor("owner@example.test")).toEqual([ownersCase.id]);

    // The org admin is a member of neither case: oversight grants the
    // INTERNAL case only.
    expect(await listFor("admin@example.test")).toEqual([ownersCase.id]);

    // A user from another organization sees nothing.
    expect(await listFor("outsider@example.test")).toEqual([]);
  });
});
