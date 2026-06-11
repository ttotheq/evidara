import { createHash, randomUUID } from "node:crypto";
import {
  CaptureError,
  captureWebPage,
  WEB_PAGE_CAPTURE_KEY,
  webPageCaptureInputSchema,
  type WebPageCapture,
} from "@evidara/connectors-sdk";
import type { AuditAction } from "@evidara/contracts";
import { database, Prisma } from "@evidara/database";
import { config } from "./config.js";
import {
  copyObject,
  deleteObjectQuietly,
  putObject,
  storageBucket,
  STORAGE_PROVIDER,
} from "./object-storage.js";

const TEMP_KEY_PREFIX = "uploads/tmp/";
const EVIDENCE_KEY_PREFIX = "evidence/";
const UPLOAD_RECORD_TTL_MS = 60 * 60 * 1000;
const EXTRACTED_TEXT_LIMIT = 100_000;

type JobWithCase = Prisma.ConnectorJobGetPayload<{ include: { case: true } }>;

interface AttemptFailure {
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
}

function classifyFailure(error: unknown): AttemptFailure {
  if (error instanceof CaptureError) {
    return {
      errorCode: error.code,
      errorMessage: error.message,
      retryable: error.retryable,
    };
  }
  // Storage or database hiccups are usually transient; let analysts retry.
  return {
    errorCode: "CONNECTOR_EXECUTION_FAILED",
    errorMessage: "The connector failed unexpectedly.",
    retryable: true,
  };
}

async function updateProgress(
  jobId: string,
  percent: number,
  message: string,
): Promise<void> {
  await database.connectorJob
    .updateMany({
      where: { id: jobId, status: "RUNNING" },
      data: {
        progress: Math.max(0, Math.min(100, Math.round(percent))),
        statusMessage: message,
      },
    })
    .catch(() => undefined);
}

// Stores the captured page through the same temp-key → promote → transaction
// pattern as API file uploads: bytes land on a temporary key tracked by an
// Upload row, are server-side copied to an opaque immutable key, and the
// evidence/blob/audit/job records commit together. Failures leave no durable
// evidence record and no untracked object.
async function ingestCapture(
  job: JobWithCase,
  attemptNumber: number,
  capture: WebPageCapture,
): Promise<string> {
  const sha256 = createHash("sha256").update(capture.body).digest("hex");
  const byteSize = capture.body.length;
  const uploadId = randomUUID();
  const tempKey = `${TEMP_KEY_PREFIX}${uploadId}`;
  const filename =
    capture.contentType === "text/plain" ? "capture.txt" : "capture.html";
  const evidenceIdempotencyKey = `connector-job:${job.id}`;

  await database.upload.create({
    data: {
      id: uploadId,
      caseId: job.caseId,
      actorId: job.requestedById,
      tempObjectKey: tempKey,
      expectedBytes: BigInt(byteSize),
      idempotencyKey: evidenceIdempotencyKey,
      expiresAt: new Date(Date.now() + UPLOAD_RECORD_TTL_MS),
    },
  });

  const failUpload = async (errorCode: string) => {
    await deleteObjectQuietly(tempKey);
    await database.upload
      .update({
        where: { id: uploadId },
        data: { status: "FAILED", errorCode, completedAt: new Date() },
      })
      .catch(() => undefined);
  };

  try {
    await putObject(tempKey, capture.body, capture.contentType);
  } catch (error) {
    await failUpload("STORAGE_ERROR");
    throw error;
  }

  const existingBlob = await database.evidenceBlob.findUnique({
    where: { sha256_byteSize: { sha256, byteSize: BigInt(byteSize) } },
  });

  let objectKey = existingBlob?.objectKey ?? null;
  let etag = existingBlob?.etag ?? null;
  let copiedKey: string | null = null;
  if (!objectKey) {
    copiedKey = `${EVIDENCE_KEY_PREFIX}${randomUUID()}`;
    const copied = await copyObject(tempKey, copiedKey);
    objectKey = copiedKey;
    etag = copied.etag;
  }
  const finalKey = objectKey;

  const title = (capture.title ?? capture.finalUrl).slice(0, 500);
  const extractedText = capture.extractedText.slice(0, EXTRACTED_TEXT_LIMIT);
  const now = new Date();

  try {
    const created = await database.$transaction(async (tx) => {
      const blob = await tx.evidenceBlob.upsert({
        where: { sha256_byteSize: { sha256, byteSize: BigInt(byteSize) } },
        create: {
          sha256,
          byteSize: BigInt(byteSize),
          mediaType: capture.contentType,
          objectKey: finalKey,
          storageProvider: STORAGE_PROVIDER,
          bucket: storageBucket(),
          etag,
        },
        update: {},
      });

      const item = await tx.evidenceItem.create({
        data: {
          caseId: job.caseId,
          blobId: blob.id,
          createdById: job.requestedById,
          kind: "WEB_CAPTURE",
          // Captures inherit the case handling level until reclassified.
          handlingLevel: job.case.handlingLevel,
          title,
          originalFilename: filename,
          sourceUrl: capture.requestedUrl,
          canonicalUrl: capture.canonicalUrl ?? capture.finalUrl,
          sourceMethod: WEB_PAGE_CAPTURE_KEY,
          observedAt: new Date(capture.fetchedAt),
          connectorKey: job.connectorKey,
          connectorVersion: job.connectorVersion,
          rawMetadata: {
            status: capture.status,
            headers: capture.headers,
            redirectChain: capture.redirectChain,
            contentType: capture.contentType,
            durationMs: capture.durationMs,
            extractedText,
            extractedTextTruncated:
              capture.extractedText.length > EXTRACTED_TEXT_LIMIT,
          },
          provenance: {
            method: WEB_PAGE_CAPTURE_KEY,
            connectorKey: job.connectorKey,
            connectorVersion: job.connectorVersion,
            jobId: job.id,
            attemptNumber,
            requestedById: job.requestedById,
            requestedUrl: capture.requestedUrl,
            finalUrl: capture.finalUrl,
            canonicalUrl: capture.canonicalUrl,
            redirectChain: capture.redirectChain,
            httpStatus: capture.status,
            userAgent: capture.userAgent,
            fetchedAt: capture.fetchedAt,
            durationMs: capture.durationMs,
            sha256,
            byteSize,
          },
          idempotencyKey: evidenceIdempotencyKey,
        },
      });

      await tx.upload.update({
        where: { id: uploadId },
        data: {
          status: "COMPLETED",
          observedBytes: BigInt(byteSize),
          completedAt: new Date(),
        },
      });

      await tx.connectorJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          progress: 100,
          statusMessage: "Capture complete",
          errorCode: null,
          errorMessage: null,
          completedAt: now,
          resultEvidenceId: item.id,
        },
      });

      await tx.connectorAttempt.update({
        where: {
          jobId_attemptNumber: { jobId: job.id, attemptNumber },
        },
        data: { completedAt: now, succeeded: true },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: job.case.organizationId,
          caseId: job.caseId,
          actorId: job.requestedById,
          action: "evidence.created" satisfies AuditAction,
          resourceType: "evidence",
          resourceId: item.id,
          outcome: "success",
          metadata: {
            kind: "WEB_CAPTURE",
            connectorKey: job.connectorKey,
            jobId: job.id,
            sha256,
            byteSize,
            mediaType: capture.contentType,
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: job.case.organizationId,
          caseId: job.caseId,
          actorId: job.requestedById,
          action: "connector_job.succeeded" satisfies AuditAction,
          resourceType: "connector_job",
          resourceId: job.id,
          outcome: "success",
          metadata: {
            connectorKey: job.connectorKey,
            attemptNumber,
            resultEvidenceId: item.id,
          },
        },
      });

      // A concurrent identical capture may have created the blob first; the
      // upsert then returns its row and our promoted copy is redundant.
      return {
        evidenceId: item.id,
        redundantCopy: copiedKey !== null && blob.objectKey !== copiedKey,
      };
    });

    if (created.redundantCopy && copiedKey) {
      await deleteObjectQuietly(copiedKey);
    }
    await deleteObjectQuietly(tempKey);
    return created.evidenceId;
  } catch (error) {
    if (copiedKey) {
      const adopted = await database.evidenceBlob.findUnique({
        where: { objectKey: copiedKey },
      });
      if (!adopted) await deleteObjectQuietly(copiedKey);
    }
    await failUpload("STORAGE_ERROR");
    throw error;
  }
}

async function failJob(
  job: JobWithCase,
  attemptNumber: number,
  failure: AttemptFailure,
): Promise<void> {
  const now = new Date();
  await database.$transaction(async (tx) => {
    await tx.connectorJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        statusMessage: null,
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
        completedAt: now,
      },
    });
    await tx.connectorAttempt.update({
      where: { jobId_attemptNumber: { jobId: job.id, attemptNumber } },
      data: {
        completedAt: now,
        succeeded: false,
        retryable: failure.retryable,
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
      },
    });
    await tx.auditEvent.create({
      data: {
        organizationId: job.case.organizationId,
        caseId: job.caseId,
        actorId: job.requestedById,
        action: "connector_job.failed" satisfies AuditAction,
        resourceType: "connector_job",
        resourceId: job.id,
        outcome: "failure",
        metadata: {
          connectorKey: job.connectorKey,
          attemptNumber,
          errorCode: failure.errorCode,
          retryable: failure.retryable,
        },
      },
    });
  });
}

// Executes one queued connector job end to end. Safe against stale queue
// entries: jobs already terminal or currently running are skipped.
export async function executeConnectorJob(connectorJobId: string): Promise<void> {
  const claimed = await database.connectorJob.updateMany({
    where: { id: connectorJobId, status: "QUEUED" },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      attemptCount: { increment: 1 },
      progress: 5,
      statusMessage: "Starting capture",
      errorCode: null,
      errorMessage: null,
    },
  });
  if (claimed.count === 0) return;

  const job = await database.connectorJob.findUniqueOrThrow({
    where: { id: connectorJobId },
    include: { case: true },
  });
  const attemptNumber = job.attemptCount;
  await database.connectorAttempt.create({
    data: { jobId: job.id, attemptNumber },
  });

  if (job.connectorKey !== WEB_PAGE_CAPTURE_KEY) {
    await failJob(job, attemptNumber, {
      errorCode: "CONNECTOR_NOT_REGISTERED",
      errorMessage: `No connector is registered for "${job.connectorKey}".`,
      retryable: false,
    });
    return;
  }

  const input = webPageCaptureInputSchema.safeParse(job.input);
  if (!input.success) {
    await failJob(job, attemptNumber, {
      errorCode: "INVALID_INPUT",
      errorMessage: "The stored job input is not valid for this connector.",
      retryable: false,
    });
    return;
  }

  try {
    const capture = await captureWebPage(input.data.url, {
      maxRedirects: config.CAPTURE_MAX_REDIRECTS,
      maxResponseBytes: config.CAPTURE_MAX_RESPONSE_BYTES,
      maxDecompressedBytes: config.CAPTURE_MAX_DECOMPRESSED_BYTES,
      timeoutMs: config.CAPTURE_TIMEOUT_SECONDS * 1000,
      allowedContentTypes: config.CAPTURE_ALLOWED_CONTENT_TYPES,
      userAgent: config.CAPTURE_USER_AGENT,
      allowedHosts: config.CAPTURE_FIXTURE_ALLOWLIST,
      onProgress: (percent, message) =>
        updateProgress(job.id, percent, message),
    });

    await updateProgress(job.id, 90, "Storing evidence");
    await ingestCapture(job, attemptNumber, capture);
  } catch (error) {
    await failJob(job, attemptNumber, classifyFailure(error));
  }
}
