import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { database } from "@evidara/database";
import { Queue, Worker } from "bullmq";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createJobFixture,
  getObjectBytes,
  objectExists,
  resetDatabase,
} from "./helpers.js";

const FIXTURE_BODY = [
  "<!doctype html>",
  "<html>",
  "<head><title>Worker fixture page</title></head>",
  "<body><h1>Captured heading</h1><p>Readable fixture paragraph.</p></body>",
  "</html>",
].join("\n");

let fixtureServer: Server;
let fixtureOrigin: string;
let refusedOrigin: string;

// The worker config parses CAPTURE_FIXTURE_ALLOWLIST when its module loads,
// and the fixture port is only known after the server starts, so the
// execution service is imported dynamically once the environment is ready.
let executeConnectorJob: typeof import("../src/execute.js")["executeConnectorJob"];
let redisUrl: string;

beforeAll(async () => {
  fixtureServer = createServer((request, response) => {
    if (request.url === "/error") {
      response.writeHead(500, { "content-type": "text/html" });
      response.end("<html><body>boom</body></html>");
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(FIXTURE_BODY);
  });
  await new Promise<void>((resolve) =>
    fixtureServer.listen(0, "127.0.0.1", resolve),
  );
  const fixturePort = (fixtureServer.address() as AddressInfo).port;
  fixtureOrigin = `http://127.0.0.1:${fixturePort}`;

  // Reserve a port, then close it again, to test connection failures against
  // an allowlisted but unreachable target.
  const throwaway = createServer(() => undefined);
  await new Promise<void>((resolve) =>
    throwaway.listen(0, "127.0.0.1", resolve),
  );
  const refusedPort = (throwaway.address() as AddressInfo).port;
  await new Promise<void>((resolve) => throwaway.close(() => resolve()));
  refusedOrigin = `http://127.0.0.1:${refusedPort}`;

  process.env.CAPTURE_FIXTURE_ALLOWLIST = `127.0.0.1:${fixturePort},127.0.0.1:${refusedPort}`;
  ({ executeConnectorJob } = await import("../src/execute.js"));
  ({
    config: { REDIS_URL: redisUrl },
  } = await import("../src/config.js"));
});

afterAll(async () => {
  await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
  await database.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("executeConnectorJob success path", () => {
  it("captures the fixture page and records evidence, provenance, and audit", async () => {
    const { caseRecord, user, job } = await createJobFixture({
      url: `${fixtureOrigin}/page`,
    });

    await executeConnectorJob(job.id);

    const finished = await database.connectorJob.findUniqueOrThrow({
      where: { id: job.id },
      include: { attempts: true },
    });
    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.progress).toBe(100);
    expect(finished.statusMessage).toBe("Capture complete");
    expect(finished.attemptCount).toBe(1);
    expect(finished.errorCode).toBeNull();
    expect(finished.completedAt).not.toBeNull();
    expect(finished.attempts).toHaveLength(1);
    expect(finished.attempts[0]?.succeeded).toBe(true);
    expect(finished.resultEvidenceId).toBeTruthy();

    const evidence = await database.evidenceItem.findUniqueOrThrow({
      where: { id: finished.resultEvidenceId ?? "" },
      include: { blob: true },
    });
    expect(evidence.caseId).toBe(caseRecord.id);
    expect(evidence.createdById).toBe(user.id);
    expect(evidence.kind).toBe("WEB_CAPTURE");
    expect(evidence.title).toBe("Worker fixture page");
    expect(evidence.sourceUrl).toBe(`${fixtureOrigin}/page`);
    expect(evidence.idempotencyKey).toBe(`connector-job:${job.id}`);
    expect(evidence.connectorVersion).toBe("1.0.0");

    const expectedSha = createHash("sha256")
      .update(Buffer.from(FIXTURE_BODY))
      .digest("hex");
    expect(evidence.blob.sha256).toBe(expectedSha);
    expect(Number(evidence.blob.byteSize)).toBe(
      Buffer.byteLength(FIXTURE_BODY),
    );
    const stored = await getObjectBytes(evidence.blob.objectKey);
    expect(stored.toString("utf8")).toBe(FIXTURE_BODY);

    const rawMetadata = evidence.rawMetadata as {
      status: number;
      extractedText: string;
      headers: Record<string, string>;
    };
    expect(rawMetadata.status).toBe(200);
    expect(rawMetadata.extractedText).toContain("Readable fixture paragraph.");
    expect(rawMetadata.headers).not.toHaveProperty("set-cookie");

    const provenance = evidence.provenance as {
      jobId: string;
      sha256: string;
      finalUrl: string;
    };
    expect(provenance.jobId).toBe(job.id);
    expect(provenance.sha256).toBe(expectedSha);
    expect(provenance.finalUrl).toBe(`${fixtureOrigin}/page`);

    const upload = await database.upload.findFirstOrThrow({
      where: { caseId: caseRecord.id },
    });
    expect(upload.status).toBe("COMPLETED");
    expect(await objectExists(upload.tempObjectKey)).toBe(false);

    const auditActions = (
      await database.auditEvent.findMany({
        where: { caseId: caseRecord.id },
      })
    ).map((event) => event.action);
    expect(auditActions).toContain("evidence.created");
    expect(auditActions).toContain("connector_job.succeeded");
  });

  it("ignores stale queue entries for jobs that already finished", async () => {
    const { job } = await createJobFixture({ url: `${fixtureOrigin}/page` });
    await executeConnectorJob(job.id);
    await executeConnectorJob(job.id);

    const finished = await database.connectorJob.findUniqueOrThrow({
      where: { id: job.id },
      include: { attempts: true },
    });
    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.attemptCount).toBe(1);
    expect(finished.attempts).toHaveLength(1);
    expect(await database.evidenceItem.count()).toBe(1);
  });

  it("reuses the existing blob when two jobs capture identical content", async () => {
    const first = await createJobFixture({ url: `${fixtureOrigin}/page` });
    const second = await createJobFixture({ url: `${fixtureOrigin}/page` });

    await executeConnectorJob(first.job.id);
    await executeConnectorJob(second.job.id);

    const items = await database.evidenceItem.findMany({
      orderBy: { createdAt: "asc" },
    });
    expect(items).toHaveLength(2);
    expect(items[0]?.blobId).toBe(items[1]?.blobId);
    expect(await database.evidenceBlob.count()).toBe(1);
  });
});

describe("executeConnectorJob failure paths", () => {
  async function expectFailed(
    jobId: string,
    errorCode: string,
    retryable: boolean,
  ) {
    const failed = await database.connectorJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { attempts: true },
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.errorCode).toBe(errorCode);
    expect(failed.attempts).toHaveLength(1);
    expect(failed.attempts[0]?.succeeded).toBe(false);
    expect(failed.attempts[0]?.retryable).toBe(retryable);
    expect(failed.attempts[0]?.errorCode).toBe(errorCode);
    const audited = await database.auditEvent.findMany({
      where: { resourceId: jobId, action: "connector_job.failed" },
    });
    expect(audited).toHaveLength(1);
    return failed;
  }

  it("blocks targets outside the fixture allowlist without creating evidence", async () => {
    const { job } = await createJobFixture({
      url: "http://169.254.169.254/latest/meta-data/",
    });
    await executeConnectorJob(job.id);
    await expectFailed(job.id, "BLOCKED_TARGET", false);
    expect(await database.evidenceItem.count()).toBe(0);
    expect(await database.upload.count()).toBe(0);
  });

  it("classifies upstream server errors as retryable", async () => {
    const { job } = await createJobFixture({ url: `${fixtureOrigin}/error` });
    await executeConnectorJob(job.id);
    await expectFailed(job.id, "HTTP_ERROR", true);
  });

  it("classifies refused connections as retryable", async () => {
    const { job } = await createJobFixture({ url: `${refusedOrigin}/` });
    await executeConnectorJob(job.id);
    await expectFailed(job.id, "CONNECTION_FAILED", true);
  });

  it("fails fast for connector keys with no registered execution", async () => {
    const { job } = await createJobFixture({
      url: `${fixtureOrigin}/page`,
      connectorKey: "not-a-connector",
    });
    await executeConnectorJob(job.id);
    await expectFailed(job.id, "CONNECTOR_NOT_REGISTERED", false);
  });

  it("fails fast when the stored job input does not validate", async () => {
    const { job } = await createJobFixture({ jobInput: { url: "" } });
    await executeConnectorJob(job.id);
    await expectFailed(job.id, "INVALID_INPUT", false);
  });

  it("does not touch jobs that are not in the QUEUED state", async () => {
    const { job } = await createJobFixture({ url: `${fixtureOrigin}/page` });
    await database.connectorJob.update({
      where: { id: job.id },
      data: { status: "RUNNING" },
    });

    await executeConnectorJob(job.id);

    const untouched = await database.connectorJob.findUniqueOrThrow({
      where: { id: job.id },
      include: { attempts: true },
    });
    expect(untouched.status).toBe("RUNNING");
    expect(untouched.attemptCount).toBe(0);
    expect(untouched.attempts).toHaveLength(0);
  });
});

describe("queue round-trip", () => {
  it("processes an enqueued job through a BullMQ worker to completion", async () => {
    const { job } = await createJobFixture({ url: `${fixtureOrigin}/page` });

    const parsed = new URL(redisUrl);
    const connection = {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      ...(parsed.pathname.length > 1
        ? { db: Number(parsed.pathname.slice(1)) }
        : {}),
      maxRetriesPerRequest: null,
    };

    const queue = new Queue("connector-jobs", { connection });
    const worker = new Worker(
      "connector-jobs",
      async (queueJob) => {
        await executeConnectorJob(queueJob.data.connectorJobId as string);
      },
      { connection, concurrency: 1 },
    );

    try {
      const completed = new Promise<void>((resolve, reject) => {
        worker.on("completed", () => resolve());
        worker.on("failed", (_queueJob, error) => reject(error));
      });
      await queue.add(
        "web-page-capture",
        { connectorJobId: job.id },
        {
          jobId: `${job.id}-attempt-1`,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      await completed;
    } finally {
      await worker.close();
      await queue.close();
    }

    const finished = await database.connectorJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(finished.status).toBe("SUCCEEDED");
    expect(finished.resultEvidenceId).toBeTruthy();
  });
});
