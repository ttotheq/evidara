import { createHash, randomUUID } from "node:crypto";
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
import { buildMultipartPayload } from "../multipart.js";

type App = Awaited<ReturnType<typeof buildApp>>;
type Session = Awaited<ReturnType<typeof login>>;

// A real 1x1 transparent PNG; content detection parses beyond the signature.
const PNG_CONTENT = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const TEXT_CONTENT = Buffer.from("collected evidence sample\n", "utf8");

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function uploadFile(
  app: App,
  session: Session,
  caseId: string,
  options: {
    fields?: Record<string, string>;
    filename?: string;
    contentType?: string;
    content: Buffer;
    idempotencyKey?: string;
  },
) {
  const { payload, contentType } = buildMultipartPayload(options.fields ?? {}, {
    filename: options.filename ?? "sample.txt",
    contentType: options.contentType ?? "text/plain",
    content: options.content,
  });
  return app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/evidence/files`,
    cookies: session.cookie,
    headers: {
      "x-csrf-token": session.csrfToken,
      "idempotency-key": options.idempotencyKey ?? randomUUID(),
      "content-type": contentType,
    },
    payload,
  });
}

async function createManual(
  app: App,
  session: Session,
  caseId: string,
  body: Record<string, unknown>,
  idempotencyKey = randomUUID(),
) {
  return app.inject({
    method: "POST",
    url: `/v1/cases/${caseId}/evidence/manual`,
    cookies: session.cookie,
    headers: {
      "x-csrf-token": session.csrfToken,
      "idempotency-key": idempotencyKey,
    },
    payload: { title: "Manual observation", ...body },
  });
}

describe("evidence", () => {
  let app: App;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  let caseId: string;
  let organizationId: string;
  let ownerSession: Session;

  beforeEach(async () => {
    await resetDatabase();
    const organization = await createOrganization("acme");
    organizationId = organization.id;
    const owner = await createUser("owner@example.com");
    await addMember(organization.id, owner.id, "OWNER");
    const fixture = await createCaseFixture({
      organizationId: organization.id,
      createdById: owner.id,
    });
    caseId = fixture.id;
    ownerSession = await login(app, "owner@example.com");
  });

  async function createViewerSession(): Promise<Session> {
    const viewer = await createUser("viewer@example.com");
    await addMember(organizationId, viewer.id, "MEMBER");
    await addCaseMember(caseId, viewer.id, "VIEWER");
    return login(app, "viewer@example.com");
  }

  describe("file upload", () => {
    it("stores the file with a server-computed hash and audited provenance", async () => {
      const response = await uploadFile(app, ownerSession, caseId, {
        fields: { title: "Sample text", handlingLevel: "SENSITIVE" },
        content: TEXT_CONTENT,
      });

      expect(response.statusCode).toBe(201);
      const { data } = response.json();
      expect(data.kind).toBe("FILE");
      expect(data.title).toBe("Sample text");
      expect(data.originalFilename).toBe("sample.txt");
      expect(data.handlingLevel).toBe("SENSITIVE");
      expect(data.blob.sha256).toBe(sha256(TEXT_CONTENT));
      expect(data.blob.byteSize).toBe(TEXT_CONTENT.length);
      expect(data.blob.mediaType).toBe("text/plain");
      expect(data.collectionCompleteness).toBe("COMPLETE");
      expect(data.provenance.detectedMediaType).toBe("text/plain");

      // Storage details never leave the server.
      expect(response.body).not.toContain("objectKey");
      expect(response.body).not.toContain("bucket");

      const audit = await database.auditEvent.findMany({
        where: { caseId, action: "evidence.created" },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.resourceId).toBe(data.id);

      const upload = await database.upload.findFirst({ where: { caseId } });
      expect(upload?.status).toBe("COMPLETED");
      expect(Number(upload?.observedBytes)).toBe(TEXT_CONTENT.length);
    });

    it("detects binary content types from magic bytes, not the declaration", async () => {
      const response = await uploadFile(app, ownerSession, caseId, {
        filename: "image.bin",
        contentType: "text/plain",
        content: PNG_CONTENT,
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().data.blob.mediaType).toBe("image/png");
    });

    it("round-trips bytes exactly through a signed download that is audited", async () => {
      const uploadResponse = await uploadFile(app, ownerSession, caseId, {
        content: PNG_CONTENT,
        filename: "capture.png",
        contentType: "image/png",
      });
      expect(uploadResponse.statusCode).toBe(201);
      const evidenceId = uploadResponse.json().data.id;

      const downloadResponse = await app.inject({
        method: "GET",
        url: `/v1/cases/${caseId}/evidence/${evidenceId}/download`,
        cookies: ownerSession.cookie,
      });
      expect(downloadResponse.statusCode).toBe(200);
      const { data } = downloadResponse.json();
      expect(data.filename).toBe("capture.png");

      const fetched = await fetch(data.url);
      expect(fetched.status).toBe(200);
      const body = Buffer.from(await fetched.arrayBuffer());
      expect(body.equals(PNG_CONTENT)).toBe(true);
      expect(sha256(body)).toBe(sha256(PNG_CONTENT));

      const audit = await database.auditEvent.findMany({
        where: { caseId, action: "evidence.downloaded" },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]?.resourceId).toBe(evidenceId);
    });

    it("replays idempotent uploads without duplicating evidence", async () => {
      const idempotencyKey = randomUUID();
      const first = await uploadFile(app, ownerSession, caseId, {
        content: TEXT_CONTENT,
        idempotencyKey,
      });
      const second = await uploadFile(app, ownerSession, caseId, {
        content: TEXT_CONTENT,
        idempotencyKey,
      });
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(200);
      expect(second.json().data.id).toBe(first.json().data.id);
      expect(await database.evidenceItem.count()).toBe(1);
    });

    it("deduplicates identical content into one stored blob", async () => {
      const first = await uploadFile(app, ownerSession, caseId, {
        content: TEXT_CONTENT,
        filename: "one.txt",
      });
      const second = await uploadFile(app, ownerSession, caseId, {
        content: TEXT_CONTENT,
        filename: "two.txt",
      });
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(await database.evidenceItem.count()).toBe(2);
      expect(await database.evidenceBlob.count()).toBe(1);
    });

    it("rejects disallowed content types and leaves no durable record", async () => {
      const junk = Buffer.from([0x00, 0x01, 0xfe, 0xff, 0x10, 0x00, 0x7f]);
      const response = await uploadFile(app, ownerSession, caseId, {
        fields: { title: "Disguised binary" },
        contentType: "text/plain",
        content: junk,
      });
      expect(response.statusCode).toBe(415);
      expect(response.json().error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
      expect(await database.evidenceItem.count()).toBe(0);
      expect(await database.evidenceBlob.count()).toBe(0);

      const upload = await database.upload.findFirst({ where: { caseId } });
      expect(upload?.status).toBe("FAILED");
      expect(upload?.errorCode).toBe("UNSUPPORTED_TYPE");
    });

    it("rejects files above the configured size limit and cleans up", async () => {
      const oversized = Buffer.alloc(4 * 1024, "a");
      const response = await uploadFile(app, ownerSession, caseId, {
        content: oversized,
      });
      expect(response.statusCode).toBe(413);
      expect(response.json().error.code).toBe("FILE_TOO_LARGE");
      expect(await database.evidenceItem.count()).toBe(0);

      const upload = await database.upload.findFirst({ where: { caseId } });
      expect(upload?.status).toBe("FAILED");
      expect(upload?.errorCode).toBe("TOO_LARGE");
    });

    it("rejects empty files", async () => {
      const response = await uploadFile(app, ownerSession, caseId, {
        content: Buffer.alloc(0),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("EMPTY_FILE");
      expect(await database.evidenceItem.count()).toBe(0);
    });

    it("rejects invalid metadata before accepting any bytes", async () => {
      const response = await uploadFile(app, ownerSession, caseId, {
        fields: { handlingLevel: "TOPSECRET" },
        content: TEXT_CONTENT,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("INVALID_METADATA");
      expect(await database.upload.count()).toBe(0);
      expect(await database.evidenceItem.count()).toBe(0);
    });

    it("requires a file part", async () => {
      const boundary = "----evidara-test-boundary";
      const payload = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nNo file\r\n--${boundary}--\r\n`,
        "utf8",
      );
      const response = await app.inject({
        method: "POST",
        url: `/v1/cases/${caseId}/evidence/files`,
        cookies: ownerSession.cookie,
        headers: {
          "x-csrf-token": ownerSession.csrfToken,
          "idempotency-key": randomUUID(),
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("FILE_REQUIRED");
    });
  });

  describe("manual evidence", () => {
    it("records manual evidence without binary content", async () => {
      const response = await createManual(app, ownerSession, caseId, {
        description: "Observed in person at the site visit.",
        observedAt: new Date("2026-06-01T10:00:00Z").toISOString(),
      });
      expect(response.statusCode).toBe(201);
      const { data } = response.json();
      expect(data.kind).toBe("MANUAL");
      expect(data.blob).toBeNull();
      expect(data.sourceMethod).toBe("manual-entry");

      const download = await app.inject({
        method: "GET",
        url: `/v1/cases/${caseId}/evidence/${data.id}/download`,
        cookies: ownerSession.cookie,
      });
      expect(download.statusCode).toBe(409);
      expect(download.json().error.code).toBe("NO_BINARY_CONTENT");
    });

    it("replays idempotent manual creation", async () => {
      const idempotencyKey = randomUUID();
      const first = await createManual(
        app,
        ownerSession,
        caseId,
        {},
        idempotencyKey,
      );
      const second = await createManual(
        app,
        ownerSession,
        caseId,
        {},
        idempotencyKey,
      );
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(200);
      expect(second.json().data.id).toBe(first.json().data.id);
      expect(await database.evidenceItem.count()).toBe(1);
    });
  });

  describe("register listing", () => {
    it("filters by kind, status, and collection date", async () => {
      await uploadFile(app, ownerSession, caseId, { content: TEXT_CONTENT });
      const manual = await createManual(app, ownerSession, caseId, {});
      const manualId = manual.json().data.id;

      const byKind = await app.inject({
        method: "GET",
        url: `/v1/cases/${caseId}/evidence?kind=MANUAL`,
        cookies: ownerSession.cookie,
      });
      expect(byKind.statusCode).toBe(200);
      expect(byKind.json().data).toHaveLength(1);
      expect(byKind.json().data[0].id).toBe(manualId);

      await app.inject({
        method: "PATCH",
        url: `/v1/cases/${caseId}/evidence/${manualId}`,
        cookies: ownerSession.cookie,
        headers: { "x-csrf-token": ownerSession.csrfToken, "if-match": "1" },
        payload: { status: "VERIFIED" },
      });
      const byStatus = await app.inject({
        method: "GET",
        url: `/v1/cases/${caseId}/evidence?status=VERIFIED`,
        cookies: ownerSession.cookie,
      });
      expect(byStatus.json().data).toHaveLength(1);
      expect(byStatus.json().data[0].id).toBe(manualId);

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const byDate = await app.inject({
        method: "GET",
        url: `/v1/cases/${caseId}/evidence?collectedFrom=${encodeURIComponent(tomorrow.toISOString())}`,
        cookies: ownerSession.cookie,
      });
      expect(byDate.json().data).toHaveLength(0);
    });

    it("paginates with a stable cursor", async () => {
      for (let index = 0; index < 3; index += 1) {
        await createManual(app, ownerSession, caseId, {
          title: `Observation ${index}`,
        });
      }
      const firstPage = await app.inject({
        method: "GET",
        url: `/v1/cases/${caseId}/evidence?limit=2`,
        cookies: ownerSession.cookie,
      });
      const first = firstPage.json();
      expect(first.data).toHaveLength(2);
      expect(first.nextCursor).toBeDefined();

      const secondPage = await app.inject({
        method: "GET",
        url: `/v1/cases/${caseId}/evidence?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`,
        cookies: ownerSession.cookie,
      });
      const second = secondPage.json();
      expect(second.data).toHaveLength(1);
      expect(second.nextCursor).toBeUndefined();

      const firstIds = first.data.map((item: { id: string }) => item.id);
      expect(firstIds).not.toContain(second.data[0].id);
    });

    it("rejects malformed cursors", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/cases/${caseId}/evidence?cursor=garbage`,
        cookies: ownerSession.cookie,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("INVALID_CURSOR");
    });
  });

  describe("updates", () => {
    it("updates metadata with optimistic concurrency", async () => {
      const created = await createManual(app, ownerSession, caseId, {});
      const evidenceId = created.json().data.id;

      const updated = await app.inject({
        method: "PATCH",
        url: `/v1/cases/${caseId}/evidence/${evidenceId}`,
        cookies: ownerSession.cookie,
        headers: { "x-csrf-token": ownerSession.csrfToken, "if-match": "1" },
        payload: { analystNotes: "Cross-checked with public records." },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().data.version).toBe(2);

      const stale = await app.inject({
        method: "PATCH",
        url: `/v1/cases/${caseId}/evidence/${evidenceId}`,
        cookies: ownerSession.cookie,
        headers: { "x-csrf-token": ownerSession.csrfToken, "if-match": "1" },
        payload: { status: "VERIFIED" },
      });
      expect(stale.statusCode).toBe(412);
      expect(stale.json().error.currentVersion).toBe(2);

      const audit = await database.auditEvent.findMany({
        where: { caseId, action: "evidence.updated" },
      });
      expect(audit).toHaveLength(1);
    });
  });

  describe("authorization", () => {
    it("lets viewers read but not create, update, or download", async () => {
      const upload = await uploadFile(app, ownerSession, caseId, {
        content: TEXT_CONTENT,
      });
      const evidenceId = upload.json().data.id;
      const viewerSession = await createViewerSession();

      const list = await app.inject({
        method: "GET",
        url: `/v1/cases/${caseId}/evidence`,
        cookies: viewerSession.cookie,
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().data).toHaveLength(1);

      const create = await uploadFile(app, viewerSession, caseId, {
        content: TEXT_CONTENT,
      });
      expect(create.statusCode).toBe(403);

      const manual = await createManual(app, viewerSession, caseId, {});
      expect(manual.statusCode).toBe(403);

      const patch = await app.inject({
        method: "PATCH",
        url: `/v1/cases/${caseId}/evidence/${evidenceId}`,
        cookies: viewerSession.cookie,
        headers: { "x-csrf-token": viewerSession.csrfToken, "if-match": "1" },
        payload: { status: "VERIFIED" },
      });
      expect(patch.statusCode).toBe(403);

      const download = await app.inject({
        method: "GET",
        url: `/v1/cases/${caseId}/evidence/${evidenceId}/download`,
        cookies: viewerSession.cookie,
      });
      expect(download.statusCode).toBe(403);
    });

    it("hides the register from users outside the organization", async () => {
      const outsider = await createUser("outsider@example.com");
      const otherOrganization = await createOrganization("other");
      await addMember(otherOrganization.id, outsider.id, "OWNER");
      const outsiderSession = await login(app, "outsider@example.com");

      const list = await app.inject({
        method: "GET",
        url: `/v1/cases/${caseId}/evidence`,
        cookies: outsiderSession.cookie,
      });
      expect(list.statusCode).toBe(404);

      const create = await uploadFile(app, outsiderSession, caseId, {
        content: TEXT_CONTENT,
      });
      expect(create.statusCode).toBe(404);
    });

    it("treats cross-case evidence ids as missing", async () => {
      const upload = await uploadFile(app, ownerSession, caseId, {
        content: TEXT_CONTENT,
      });
      const evidenceId = upload.json().data.id;

      const owner = await database.user.findUniqueOrThrow({
        where: { email: "owner@example.com" },
      });
      const otherCase = await createCaseFixture({
        organizationId,
        createdById: owner.id,
        name: "Second case",
      });

      const response = await app.inject({
        method: "GET",
        url: `/v1/cases/${otherCase.id}/evidence/${evidenceId}`,
        cookies: ownerSession.cookie,
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
