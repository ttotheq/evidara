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

async function fixture(role: "OWNER" | "ANALYST" | "VIEWER" = "OWNER") {
  const user = await createUser(`actor-${randomUUID().slice(0, 8)}@example.test`);
  const organization = await createOrganization(`org-${randomUUID().slice(0, 8)}`);
  await addMember(organization.id, user.id, "MEMBER");
  const caseRecord = await createCaseFixture({
    organizationId: organization.id,
    createdById: user.id,
    memberRole: role,
  });
  const session = await login(app, user.email);
  return { user, organization, caseRecord, session };
}

function queueJob(
  session: Session,
  caseId: string,
  overrides: Record<string, unknown> = {},
  idempotencyKey = `job-${randomUUID()}`,
) {
  return app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/connector-jobs`,
    cookies: session.cookie,
    headers: {
      "x-csrf-token": session.csrfToken,
      "idempotency-key": idempotencyKey,
    },
    payload: {
      connectorKey: "web-page-capture",
      target: { url: "https://example.com/article" },
      ...overrides,
    },
  });
}

describe("GET /v1/connectors", () => {
  it("lists available connector manifests without input schemas", async () => {
    const { session } = await fixture();
    const response = await app.inject({
      method: "GET",
      url: "/v1/connectors",
      cookies: session.cookie,
    });
    expect(response.statusCode).toBe(200);
    const { data } = response.json() as { data: Record<string, unknown>[] };
    const capture = data.find((entry) => entry.key === "web-page-capture");
    expect(capture).toBeDefined();
    expect(capture?.safetyClass).toBe("LOW");
    expect(capture?.version).toBe("1.0.0");
    expect(capture).not.toHaveProperty("inputSchema");
  });

  it("requires authentication", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/connectors" });
    expect(response.statusCode).toBe(401);
  });
});

describe("POST /v1/cases/:caseId/connector-jobs", () => {
  it("queues a web capture job with audit and queue-side records", async () => {
    const { session, caseRecord } = await fixture();
    const response = await queueJob(session, caseRecord.id);

    expect(response.statusCode).toBe(201);
    const { data } = response.json();
    expect(data.status).toBe("QUEUED");
    expect(data.connectorKey).toBe("web-page-capture");
    expect(data.targetSummary).toBe("https://example.com/article");
    expect(data.retryable).toBe(false);
    expect(data.attempts).toEqual([]);

    const audit = await database.auditEvent.findMany({
      where: { caseId: caseRecord.id, action: "connector_job.queued" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.resourceId).toBe(data.id);
  });

  it("replays idempotent submissions without duplicating jobs", async () => {
    const { session, caseRecord } = await fixture();
    const key = `job-${randomUUID()}`;
    const first = await queueJob(session, caseRecord.id, {}, key);
    const second = await queueJob(session, caseRecord.id, {}, key);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.id).toBe(first.json().data.id);
    expect(
      await database.connectorJob.count({ where: { caseId: caseRecord.id } }),
    ).toBe(1);
  });

  it("rejects unknown connectors", async () => {
    const { session, caseRecord } = await fixture();
    const response = await queueJob(session, caseRecord.id, {
      connectorKey: "nonexistent-connector",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("UNKNOWN_CONNECTOR");
  });

  it("rejects statically invalid targets at submission", async () => {
    const { session, caseRecord } = await fixture();

    const badScheme = await queueJob(session, caseRecord.id, {
      target: { url: "ftp://example.com/file" },
    });
    expect(badScheme.statusCode).toBe(400);
    expect(badScheme.json().error.code).toBe("INVALID_TARGET");

    const missingUrl = await queueJob(session, caseRecord.id, {
      target: {},
    });
    expect(missingUrl.statusCode).toBe(400);
    expect(missingUrl.json().error.code).toBe("INVALID_TARGET");

    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:8080/admin",
      "http://[::1]/",
      "http://0x7f000001/",
    ]) {
      const blockedLiteral = await queueJob(session, caseRecord.id, {
        target: { url },
      });
      expect(blockedLiteral.statusCode).toBe(400);
      expect(blockedLiteral.json().error.code).toBe("INVALID_TARGET");
    }

    expect(
      await database.connectorJob.count({ where: { caseId: caseRecord.id } }),
    ).toBe(0);
  });

  it("denies viewers (403) and outsiders (404)", async () => {
    const { caseRecord, organization } = await fixture();

    const viewer = await createUser("viewer-jobs@example.test");
    await addMember(organization.id, viewer.id, "MEMBER");
    await addCaseMember(caseRecord.id, viewer.id, "VIEWER");
    const viewerSession = await login(app, "viewer-jobs@example.test");
    const viewerResponse = await queueJob(viewerSession, caseRecord.id);
    expect(viewerResponse.statusCode).toBe(403);

    const outsider = await fixture();
    const outsiderResponse = await queueJob(outsider.session, caseRecord.id);
    expect(outsiderResponse.statusCode).toBe(404);

    expect(
      await database.connectorJob.count({ where: { caseId: caseRecord.id } }),
    ).toBe(0);
  });
});

describe("GET /v1/cases/:caseId/connector-jobs", () => {
  it("lists jobs newest first with stable cursor pagination", async () => {
    const { session, caseRecord } = await fixture();
    for (let index = 0; index < 3; index += 1) {
      const response = await queueJob(session, caseRecord.id, {
        target: { url: `https://example.com/page-${index}` },
      });
      expect(response.statusCode).toBe(201);
    }

    const firstPage = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseRecord.id}/connector-jobs?limit=2`,
      cookies: session.cookie,
    });
    expect(firstPage.statusCode).toBe(200);
    const first = firstPage.json() as {
      data: { id: string }[];
      nextCursor?: string;
    };
    expect(first.data).toHaveLength(2);
    expect(first.nextCursor).toBeDefined();

    const secondPage = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseRecord.id}/connector-jobs?limit=2&cursor=${first.nextCursor}`,
      cookies: session.cookie,
    });
    const second = secondPage.json() as { data: { id: string }[] };
    expect(second.data).toHaveLength(1);
    const ids = [...first.data, ...second.data].map((job) => job.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("supports status filtering and rejects invalid cursors", async () => {
    const { session, caseRecord } = await fixture();
    await queueJob(session, caseRecord.id);

    const filtered = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseRecord.id}/connector-jobs?status=FAILED`,
      cookies: session.cookie,
    });
    expect(filtered.json().data).toHaveLength(0);

    const invalid = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseRecord.id}/connector-jobs?cursor=garbage`,
      cookies: session.cookie,
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("INVALID_CURSOR");
  });

  it("is readable by viewers but hidden from outsiders", async () => {
    const { caseRecord, organization, session } = await fixture();
    await queueJob(session, caseRecord.id);

    const viewer = await createUser("viewer-list@example.test");
    await addMember(organization.id, viewer.id, "MEMBER");
    await addCaseMember(caseRecord.id, viewer.id, "VIEWER");
    const viewerSession = await login(app, "viewer-list@example.test");
    const viewerResponse = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseRecord.id}/connector-jobs`,
      cookies: viewerSession.cookie,
    });
    expect(viewerResponse.statusCode).toBe(200);
    expect(viewerResponse.json().data).toHaveLength(1);

    const outsider = await fixture();
    const outsiderResponse = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseRecord.id}/connector-jobs`,
      cookies: outsider.session.cookie,
    });
    expect(outsiderResponse.statusCode).toBe(404);
  });
});

describe("GET /v1/cases/:caseId/connector-jobs/:jobId", () => {
  it("returns job details and hides cross-case jobs as 404", async () => {
    const { session, caseRecord } = await fixture();
    const created = await queueJob(session, caseRecord.id);
    const jobId = created.json().data.id as string;

    const detail = await app.inject({
      method: "GET",
      url: `/v1/cases/${caseRecord.id}/connector-jobs/${jobId}`,
      cookies: session.cookie,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.id).toBe(jobId);

    const other = await fixture();
    const crossCase = await app.inject({
      method: "GET",
      url: `/v1/cases/${other.caseRecord.id}/connector-jobs/${jobId}`,
      cookies: other.session.cookie,
    });
    expect(crossCase.statusCode).toBe(404);
  });
});

describe("POST /v1/cases/:caseId/connector-jobs/:jobId/retry", () => {
  async function failJob(
    jobId: string,
    options: { retryable: boolean; attemptCount?: number },
  ) {
    await database.connectorJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorCode: "TIMEOUT",
        errorMessage: "The capture did not complete within the allowed time.",
        attemptCount: options.attemptCount ?? 1,
        attempts: {
          create: {
            attemptNumber: options.attemptCount ?? 1,
            completedAt: new Date(),
            succeeded: false,
            retryable: options.retryable,
            errorCode: "TIMEOUT",
            errorMessage:
              "The capture did not complete within the allowed time.",
          },
        },
      },
    });
  }

  function retry(session: Session, caseId: string, jobId: string) {
    return app.inject({
      method: "POST",
      url: `/v1/cases/${caseId}/connector-jobs/${jobId}/retry`,
      cookies: session.cookie,
      headers: { "x-csrf-token": session.csrfToken },
    });
  }

  it("requeues a failed retryable job and audits the retry", async () => {
    const { session, caseRecord } = await fixture();
    const created = await queueJob(session, caseRecord.id);
    const jobId = created.json().data.id as string;
    await failJob(jobId, { retryable: true });

    const response = await retry(session, caseRecord.id, jobId);
    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.status).toBe("QUEUED");
    expect(data.errorCode).toBeNull();
    expect(data.attempts).toHaveLength(1);

    const audit = await database.auditEvent.findMany({
      where: { caseId: caseRecord.id, action: "connector_job.retried" },
    });
    expect(audit).toHaveLength(1);
  });

  it("rejects retrying non-retryable, exhausted, or non-failed jobs", async () => {
    const { session, caseRecord } = await fixture();

    const created = await queueJob(session, caseRecord.id);
    const queuedJobId = created.json().data.id as string;
    const queuedRetry = await retry(session, caseRecord.id, queuedJobId);
    expect(queuedRetry.statusCode).toBe(409);
    expect(queuedRetry.json().error.code).toBe("JOB_NOT_RETRYABLE");

    await failJob(queuedJobId, { retryable: false });
    const nonRetryable = await retry(session, caseRecord.id, queuedJobId);
    expect(nonRetryable.statusCode).toBe(409);

    await failJob(queuedJobId, { retryable: true, attemptCount: 5 });
    const exhausted = await retry(session, caseRecord.id, queuedJobId);
    expect(exhausted.statusCode).toBe(409);
  });

  it("denies retry to viewers and reviewers", async () => {
    const { session, caseRecord, organization } = await fixture();
    const created = await queueJob(session, caseRecord.id);
    const jobId = created.json().data.id as string;
    await failJob(jobId, { retryable: true });

    const reviewer = await createUser("reviewer-retry@example.test");
    await addMember(organization.id, reviewer.id, "MEMBER");
    await addCaseMember(caseRecord.id, reviewer.id, "REVIEWER");
    const reviewerSession = await login(app, "reviewer-retry@example.test");
    const response = await retry(reviewerSession, caseRecord.id, jobId);
    expect(response.statusCode).toBe(403);
  });
});
