import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import {
  addCaseMember,
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

describe("case creation idempotency", () => {
  it("returns the existing case for a repeated idempotency key", async () => {
    const user = await createUser("member@example.test");
    const organization = await createOrganization("acme");
    await addMember(organization.id, user.id, "MEMBER");
    const session = await login(app, "member@example.test");

    const submit = () =>
      app.inject({
        method: "POST",
        url: "/v1/cases",
        cookies: session.cookie,
        headers: {
          "x-csrf-token": session.csrfToken,
          "idempotency-key": "stable-key-123",
        },
        payload: { ...caseBody, organizationId: organization.id },
      });

    const first = await submit();
    const second = await submit();

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.id).toBe(first.json().data.id);

    const different = await postCase(session, organization.id);
    expect(different.statusCode).toBe(201);
    expect(different.json().data.id).not.toBe(first.json().data.id);
  });
});

describe("case detail", () => {
  it("returns the case with effective permissions for a member", async () => {
    const user = await createUser("owner@example.test");
    const organization = await createOrganization("acme");
    await addMember(organization.id, user.id, "MEMBER");
    const fixture = await createCaseFixture({
      organizationId: organization.id,
      createdById: user.id,
    });

    const session = await login(app, "owner@example.test");
    const response = await app.inject({
      method: "GET",
      url: `/v1/cases/${fixture.id}`,
      cookies: session.cookie,
    });

    expect(response.statusCode).toBe(200);
    const detail = response.json().data;
    expect(detail.case.id).toBe(fixture.id);
    expect(detail.caseRole).toBe("OWNER");
    expect(detail.permissions).toContain("case.update");
    expect(detail.permissions).toContain("case.members.manage");
  });

  it("gives a case viewer read-only permissions", async () => {
    const owner = await createUser("owner@example.test");
    const viewer = await createUser("viewer@example.test");
    const organization = await createOrganization("acme");
    await addMember(organization.id, owner.id, "MEMBER");
    await addMember(organization.id, viewer.id, "MEMBER");
    const fixture = await createCaseFixture({
      organizationId: organization.id,
      createdById: owner.id,
    });
    await addCaseMember(fixture.id, viewer.id, "VIEWER");

    const session = await login(app, "viewer@example.test");
    const response = await app.inject({
      method: "GET",
      url: `/v1/cases/${fixture.id}`,
      cookies: session.cookie,
    });

    expect(response.statusCode).toBe(200);
    const detail = response.json().data;
    expect(detail.caseRole).toBe("VIEWER");
    expect(detail.permissions).toEqual(["case.read", "evidence.read"]);
  });

  it("returns 404 for outsiders and for unknown cases", async () => {
    const owner = await createUser("owner@example.test");
    const outsider = await createUser("outsider@example.test");
    const organization = await createOrganization("acme");
    const otherOrganization = await createOrganization("other");
    await addMember(organization.id, owner.id, "MEMBER");
    await addMember(otherOrganization.id, outsider.id, "OWNER");
    const fixture = await createCaseFixture({
      organizationId: organization.id,
      createdById: owner.id,
    });

    const session = await login(app, "outsider@example.test");
    const crossTenant = await app.inject({
      method: "GET",
      url: `/v1/cases/${fixture.id}`,
      cookies: session.cookie,
    });
    const unknown = await app.inject({
      method: "GET",
      url: "/v1/cases/00000000-0000-4000-8000-000000000000",
      cookies: session.cookie,
    });

    expect(crossTenant.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
  });
});

describe("case update", () => {
  async function setupCase() {
    const owner = await createUser("owner@example.test");
    const viewer = await createUser("viewer@example.test");
    const organization = await createOrganization("acme");
    await addMember(organization.id, owner.id, "MEMBER");
    await addMember(organization.id, viewer.id, "MEMBER");
    const fixture = await createCaseFixture({
      organizationId: organization.id,
      createdById: owner.id,
    });
    await addCaseMember(fixture.id, viewer.id, "VIEWER");
    return { owner, viewer, organization, fixture };
  }

  it("updates a case with a matching If-Match version and increments it", async () => {
    const { fixture } = await setupCase();
    const session = await login(app, "owner@example.test");

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/cases/${fixture.id}`,
      cookies: session.cookie,
      headers: { "x-csrf-token": session.csrfToken, "if-match": "1" },
      payload: { name: "Renamed investigation" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.name).toBe("Renamed investigation");
    expect(response.json().data.version).toBe(2);
  });

  it("returns 412 on a stale If-Match version", async () => {
    const { fixture } = await setupCase();
    const session = await login(app, "owner@example.test");

    const first = await app.inject({
      method: "PATCH",
      url: `/v1/cases/${fixture.id}`,
      cookies: session.cookie,
      headers: { "x-csrf-token": session.csrfToken, "if-match": "1" },
      payload: { name: "Renamed once" },
    });
    expect(first.statusCode).toBe(200);

    const stale = await app.inject({
      method: "PATCH",
      url: `/v1/cases/${fixture.id}`,
      cookies: session.cookie,
      headers: { "x-csrf-token": session.csrfToken, "if-match": "1" },
      payload: { name: "Renamed again" },
    });
    expect(stale.statusCode).toBe(412);
    expect(stale.json().error.currentVersion).toBe(2);
  });

  it("denies case viewers with 403 and outsiders with 404", async () => {
    const { fixture, organization } = await setupCase();
    const outsider = await createUser("outsider@example.test");
    const otherOrganization = await createOrganization("other");
    await addMember(otherOrganization.id, outsider.id, "OWNER");

    const viewerSession = await login(app, "viewer@example.test");
    const viewerResponse = await app.inject({
      method: "PATCH",
      url: `/v1/cases/${fixture.id}`,
      cookies: viewerSession.cookie,
      headers: { "x-csrf-token": viewerSession.csrfToken, "if-match": "1" },
      payload: { name: "Viewer rename attempt" },
    });
    expect(viewerResponse.statusCode).toBe(403);

    const outsiderSession = await login(app, "outsider@example.test");
    const outsiderResponse = await app.inject({
      method: "PATCH",
      url: `/v1/cases/${fixture.id}`,
      cookies: outsiderSession.cookie,
      headers: { "x-csrf-token": outsiderSession.csrfToken, "if-match": "1" },
      payload: { name: "Outsider rename attempt" },
    });
    expect(outsiderResponse.statusCode).toBe(404);
    void organization;
  });

  it("requires the If-Match header", async () => {
    const { fixture } = await setupCase();
    const session = await login(app, "owner@example.test");

    const response = await app.inject({
      method: "PATCH",
      url: `/v1/cases/${fixture.id}`,
      cookies: session.cookie,
      headers: { "x-csrf-token": session.csrfToken },
      payload: { name: "No precondition" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("case list pagination and filters", () => {
  it("walks pages with a stable cursor", async () => {
    const user = await createUser("member@example.test");
    const organization = await createOrganization("acme");
    await addMember(organization.id, user.id, "MEMBER");
    for (const name of ["Case alpha", "Case beta", "Case gamma"]) {
      await createCaseFixture({
        organizationId: organization.id,
        createdById: user.id,
        name,
      });
    }

    const session = await login(app, "member@example.test");
    const firstPage = await app.inject({
      method: "GET",
      url: "/v1/cases?limit=2",
      cookies: session.cookie,
    });
    expect(firstPage.statusCode).toBe(200);
    const firstBody = firstPage.json();
    expect(firstBody.data).toHaveLength(2);
    expect(firstBody.nextCursor).toBeDefined();

    const secondPage = await app.inject({
      method: "GET",
      url: `/v1/cases?limit=2&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
      cookies: session.cookie,
    });
    expect(secondPage.statusCode).toBe(200);
    const secondBody = secondPage.json();
    expect(secondBody.data).toHaveLength(1);
    expect(secondBody.nextCursor).toBeUndefined();

    const ids = [...firstBody.data, ...secondBody.data].map(
      (item: { id: string }) => item.id,
    );
    expect(new Set(ids).size).toBe(3);

    const invalidCursor = await app.inject({
      method: "GET",
      url: "/v1/cases?cursor=not-a-cursor",
      cookies: session.cookie,
    });
    expect(invalidCursor.statusCode).toBe(400);
  });

  it("filters by name search and status", async () => {
    const user = await createUser("member@example.test");
    const organization = await createOrganization("acme");
    await addMember(organization.id, user.id, "MEMBER");
    await createCaseFixture({
      organizationId: organization.id,
      createdById: user.id,
      name: "Phishing infrastructure",
    });
    const archived = await createCaseFixture({
      organizationId: organization.id,
      createdById: user.id,
      name: "Disinformation network",
    });
    const session = await login(app, "member@example.test");

    await app.inject({
      method: "PATCH",
      url: `/v1/cases/${archived.id}`,
      cookies: session.cookie,
      headers: { "x-csrf-token": session.csrfToken, "if-match": "1" },
      payload: { status: "ARCHIVED" },
    });

    const search = await app.inject({
      method: "GET",
      url: "/v1/cases?q=phishing",
      cookies: session.cookie,
    });
    expect(search.json().data).toHaveLength(1);
    expect(search.json().data[0].name).toBe("Phishing infrastructure");

    const archivedOnly = await app.inject({
      method: "GET",
      url: "/v1/cases?status=ARCHIVED",
      cookies: session.cookie,
    });
    expect(archivedOnly.json().data).toHaveLength(1);
    expect(archivedOnly.json().data[0].id).toBe(archived.id);
  });
});
