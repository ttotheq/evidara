import { randomUUID } from "node:crypto";
import { database } from "@evidara/database";
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
  TEST_PASSWORD,
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

type Session = { cookie: Record<string, string>; csrfToken: string };

// Creates the case through the API so its case.created audit event exists.
async function fixture() {
  const owner = await createUser(
    `owner-${randomUUID().slice(0, 8)}@example.test`,
  );
  const organization = await createOrganization(
    `org-${randomUUID().slice(0, 8)}`,
  );
  await addMember(organization.id, owner.id, "MEMBER");
  const session = await login(app, owner.email);
  const created = await app.inject({
    method: "POST",
    url: "/v1/cases",
    cookies: session.cookie,
    headers: {
      "x-csrf-token": session.csrfToken,
      "idempotency-key": `case-${randomUUID()}`,
    },
    payload: {
      organizationId: organization.id,
      name: "Audit fixture case",
      objective: "Objective text for audit case.",
      scope: "Scope text for audit case.",
      justification: "Justification text for audit case.",
    },
  });
  expect(created.statusCode).toBe(201);
  const caseRecord = created.json().data as { id: string };
  return { owner, organization, caseRecord, session };
}

function getAudit(session: Session, caseId: string, query = "") {
  return app.inject({
    method: "GET",
    url: `/v1/cases/${caseId}/audit-events${query}`,
    cookies: session.cookie,
  });
}

async function addManualEvidence(
  session: Session,
  caseId: string,
  title: string,
) {
  const response = await app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/evidence/manual`,
    cookies: session.cookie,
    headers: {
      "x-csrf-token": session.csrfToken,
      "idempotency-key": `manual-${randomUUID()}`,
    },
    payload: { title },
  });
  expect(response.statusCode).toBe(201);
}

async function memberSession(
  organizationId: string,
  caseId: string | null,
  caseRole: "ANALYST" | "REVIEWER" | "VIEWER" | null,
  email: string,
) {
  const user = await createUser(email);
  await addMember(organizationId, user.id, "MEMBER");
  if (caseId && caseRole) await addCaseMember(caseId, user.id, caseRole);
  return { user, session: await login(app, email) };
}

describe("GET /v1/cases/:caseId/audit-events authorization", () => {
  it("allows case owners and reviewers, denies analysts and viewers", async () => {
    const { organization, caseRecord, session } = await fixture();

    expect((await getAudit(session, caseRecord.id)).statusCode).toBe(200);

    const reviewer = await memberSession(
      organization.id,
      caseRecord.id,
      "REVIEWER",
      "reviewer-audit@example.test",
    );
    expect((await getAudit(reviewer.session, caseRecord.id)).statusCode).toBe(
      200,
    );

    const analyst = await memberSession(
      organization.id,
      caseRecord.id,
      "ANALYST",
      "analyst-audit@example.test",
    );
    expect((await getAudit(analyst.session, caseRecord.id)).statusCode).toBe(
      403,
    );

    const viewer = await memberSession(
      organization.id,
      caseRecord.id,
      "VIEWER",
      "viewer-audit@example.test",
    );
    expect((await getAudit(viewer.session, caseRecord.id)).statusCode).toBe(
      403,
    );
  });

  it("grants organization admins oversight except for RESTRICTED cases", async () => {
    const { organization, caseRecord } = await fixture();
    const admin = await createUser("admin-audit@example.test");
    await addMember(organization.id, admin.id, "ADMIN");
    const adminSession = await login(app, "admin-audit@example.test");

    expect((await getAudit(adminSession, caseRecord.id)).statusCode).toBe(200);

    const restricted = await createCaseFixture({
      organizationId: organization.id,
      createdById: admin.id,
      name: "Restricted case",
      handlingLevel: "RESTRICTED",
    });
    await database.caseMember.delete({
      where: { caseId_userId: { caseId: restricted.id, userId: admin.id } },
    });
    expect((await getAudit(adminSession, restricted.id)).statusCode).toBe(404);
  });

  it("hides cases from outsiders as 404", async () => {
    const { caseRecord } = await fixture();
    const outsider = await fixture();
    expect((await getAudit(outsider.session, caseRecord.id)).statusCode).toBe(
      404,
    );
  });
});

describe("audit timeline content", () => {
  it("returns newest-first events with actor and safe fields only", async () => {
    const { owner, caseRecord, session } = await fixture();
    await addManualEvidence(session, caseRecord.id, "Manual note");

    const response = await getAudit(session, caseRecord.id);
    const { data } = response.json() as { data: Record<string, unknown>[] };

    expect(data.length).toBeGreaterThanOrEqual(2);
    expect(data[0]?.action).toBe("evidence.created");
    expect(data.at(-1)?.action).toBe("case.created");
    const actor = data[0]?.actor as { id: string; displayName: string };
    expect(actor.id).toBe(owner.id);
    for (const event of data) {
      expect(event).not.toHaveProperty("ipHash");
      expect(event).toHaveProperty("outcome");
      expect(event).toHaveProperty("resourceType");
      expect(event).toHaveProperty("createdAt");
    }

    // The write path stored the privacy-preserving IP hash, server-side only.
    const stored = await database.auditEvent.findFirst({
      where: { caseId: caseRecord.id, action: "evidence.created" },
    });
    expect(stored?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.requestId).toBeTruthy();
  });

  it("paginates with a stable cursor and rejects invalid cursors", async () => {
    const { caseRecord, session } = await fixture();
    await addManualEvidence(session, caseRecord.id, "First");
    await addManualEvidence(session, caseRecord.id, "Second");

    const firstPage = await getAudit(session, caseRecord.id, "?limit=2");
    const first = firstPage.json() as {
      data: { id: string }[];
      nextCursor?: string;
    };
    expect(first.data).toHaveLength(2);
    expect(first.nextCursor).toBeDefined();

    const secondPage = await getAudit(
      session,
      caseRecord.id,
      `?limit=2&cursor=${first.nextCursor}`,
    );
    const second = secondPage.json() as { data: { id: string }[] };
    expect(second.data.length).toBeGreaterThanOrEqual(1);
    const ids = [...first.data, ...second.data].map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);

    const invalid = await getAudit(session, caseRecord.id, "?cursor=garbage");
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("INVALID_CURSOR");
  });
});

describe("denial and authentication audit coverage", () => {
  it("records denied mutations with the attempted action", async () => {
    const { organization, caseRecord, session } = await fixture();
    const viewer = await memberSession(
      organization.id,
      caseRecord.id,
      "VIEWER",
      "viewer-denied@example.test",
    );

    const denied = await app.inject({
      method: "POST",
      url: `/v1/cases/${caseRecord.id}/evidence/manual`,
      cookies: viewer.session.cookie,
      headers: {
        "x-csrf-token": viewer.session.csrfToken,
        "idempotency-key": `denied-${randomUUID()}`,
      },
      payload: { title: "Should be denied" },
    });
    expect(denied.statusCode).toBe(403);

    const response = await getAudit(session, caseRecord.id);
    const { data } = response.json() as {
      data: {
        action: string;
        outcome: string;
        actor: { id: string } | null;
        metadata: Record<string, unknown>;
      }[];
    };
    const denial = data.find(
      (event) => event.action === "authorization.denied",
    );
    expect(denial).toBeDefined();
    expect(denial?.outcome).toBe("denied");
    expect(denial?.actor?.id).toBe(viewer.user.id);
    expect(denial?.metadata.attemptedAction).toBe("evidence.create");
  });

  it("records denied audit reads", async () => {
    const { organization, caseRecord, session } = await fixture();
    const analyst = await memberSession(
      organization.id,
      caseRecord.id,
      "ANALYST",
      "analyst-denied@example.test",
    );
    expect((await getAudit(analyst.session, caseRecord.id)).statusCode).toBe(
      403,
    );

    const events = (await getAudit(session, caseRecord.id)).json() as {
      data: { action: string; metadata: Record<string, unknown> }[];
    };
    const denial = events.data.find(
      (event) => event.metadata.attemptedAction === "audit.read",
    );
    expect(denial).toBeDefined();
  });

  it("audits login success, login failure, and logout per organization", async () => {
    const user = await createUser("auth-audit@example.test");
    const organization = await createOrganization("auth-audit-org");
    await addMember(organization.id, user.id, "MEMBER");

    const failed = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: user.email, password: "wrong-password" },
    });
    expect(failed.statusCode).toBe(401);

    const session = await login(app, user.email);
    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      cookies: session.cookie,
      headers: { "x-csrf-token": session.csrfToken },
    });
    expect(logout.statusCode).toBe(204);

    const events = await database.auditEvent.findMany({
      where: { organizationId: organization.id, actorId: user.id },
      orderBy: { createdAt: "asc" },
    });
    const summary = events.map((event) => `${event.action}:${event.outcome}`);
    expect(summary).toContain("auth.login:failure");
    expect(summary).toContain("auth.login:success");
    expect(summary).toContain("auth.logout:success");
    const failure = events.find((event) => event.outcome === "failure");
    expect(failure?.metadata).toMatchObject({ reason: "invalid_credentials" });
  });

  it("does not audit unknown email addresses", async () => {
    const before = await database.auditEvent.count();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "ghost@example.test", password: TEST_PASSWORD },
    });
    expect(response.statusCode).toBe(401);
    expect(await database.auditEvent.count()).toBe(before);
  });
});

describe("audit events are append-only through the API", () => {
  it("exposes no mutation route for audit events", async () => {
    const { caseRecord, session } = await fixture();
    const events = (await getAudit(session, caseRecord.id)).json() as {
      data: { id: string }[];
    };
    const eventId = events.data[0]?.id;
    expect(eventId).toBeDefined();

    const attempts = [
      {
        method: "POST" as const,
        url: `/v1/cases/${caseRecord.id}/audit-events`,
      },
      {
        method: "PATCH" as const,
        url: `/v1/cases/${caseRecord.id}/audit-events/${eventId}`,
      },
      {
        method: "PUT" as const,
        url: `/v1/cases/${caseRecord.id}/audit-events/${eventId}`,
      },
      {
        method: "DELETE" as const,
        url: `/v1/cases/${caseRecord.id}/audit-events/${eventId}`,
      },
      {
        method: "DELETE" as const,
        url: `/v1/cases/${caseRecord.id}/audit-events`,
      },
    ];
    for (const attempt of attempts) {
      const response = await app.inject({
        method: attempt.method,
        url: attempt.url,
        cookies: session.cookie,
        headers: { "x-csrf-token": session.csrfToken },
        payload: {},
      });
      expect([404, 405]).toContain(response.statusCode);
    }

    // The registered route table itself contains no non-GET audit route.
    const routes = app.printRoutes({ commonPrefix: false });
    for (const line of routes.split("\n")) {
      if (!line.includes("audit-events")) continue;
      expect(line).not.toMatch(/POST|PUT|PATCH|DELETE/);
    }
  });
});
