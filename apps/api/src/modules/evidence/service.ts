import { createHash, randomUUID } from "node:crypto";
import { type Readable, Transform } from "node:stream";
import type {
  CreateManualEvidenceInput,
  EvidenceDownload,
  EvidenceItemView,
  ListEvidenceQuery,
  UpdateEvidenceInput,
  UploadEvidenceMetadata,
} from "@evidara/contracts";
import { database, Prisma } from "@evidara/database";
import { canInCase } from "../../authorization/policy.js";
import { config } from "../../config.js";
import {
  type AuditContext,
  recordAuditEvent,
  recordAuthorizationDenied,
} from "../../lib/audit.js";
import {
  copyObject,
  deleteObjectQuietly,
  presignDownload,
  putObjectStream,
  STORAGE_PROVIDER,
  storageBucket,
  UploadTimeoutError,
} from "../../lib/object-storage.js";
import type { AuthContext } from "../../plugins/authentication.js";
import { loadCaseContext } from "../cases/service.js";
import { detectMediaType, normalizeDeclaredType } from "./media-type.js";

const TEMP_KEY_PREFIX = "uploads/tmp/";
const EVIDENCE_KEY_PREFIX = "evidence/";
const MEDIA_TYPE_SAMPLE_BYTES = 4100;
const UPLOAD_RECORD_TTL_MS = 60 * 60 * 1000;

type CaseContext = NonNullable<Awaited<ReturnType<typeof loadCaseContext>>>;

interface Cursor {
  collectedAt: string;
  id: string;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Partial<Cursor>;
    if (
      typeof parsed.collectedAt !== "string" ||
      typeof parsed.id !== "string"
    ) {
      return null;
    }
    if (Number.isNaN(Date.parse(parsed.collectedAt))) return null;
    return { collectedAt: parsed.collectedAt, id: parsed.id };
  } catch {
    return null;
  }
}

const evidenceInclude = {
  blob: true,
  createdBy: { select: { id: true, displayName: true } },
} satisfies Prisma.EvidenceItemInclude;

type EvidenceRecord = Prisma.EvidenceItemGetPayload<{
  include: typeof evidenceInclude;
}>;

// Maps a database record to the response contract. Object keys, buckets, and
// storage metadata stay server-side by construction.
function toEvidenceView(item: EvidenceRecord): EvidenceItemView {
  return {
    id: item.id,
    caseId: item.caseId,
    kind: item.kind,
    status: item.status,
    handlingLevel: item.handlingLevel,
    title: item.title,
    description: item.description,
    originalFilename: item.originalFilename,
    sourceUrl: item.sourceUrl,
    canonicalUrl: item.canonicalUrl,
    sourceMethod: item.sourceMethod,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    observedAt: item.observedAt?.toISOString() ?? null,
    collectedAt: item.collectedAt.toISOString(),
    collectionCompleteness: item.collectionCompleteness,
    analystNotes: item.analystNotes,
    provenance: (item.provenance as Record<string, unknown> | null) ?? null,
    collectedBy: {
      id: item.createdBy.id,
      displayName: item.createdBy.displayName,
    },
    blob: item.blob
      ? {
          sha256: item.blob.sha256,
          byteSize: Number(item.blob.byteSize),
          mediaType: item.blob.mediaType,
        }
      : null,
    version: item.version,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

type AccessDenied = { outcome: "not_found" } | { outcome: "forbidden" };

async function authorizeCaseAction(
  authContext: AuthContext,
  caseId: string,
  action:
    | "evidence.read"
    | "evidence.create"
    | "evidence.update"
    | "evidence.download",
  auditContext: AuditContext,
): Promise<{ outcome: "ok"; context: CaseContext } | AccessDenied> {
  const context = await loadCaseContext(authContext, caseId);
  // Unreadable cases return not_found to prevent case-ID enumeration.
  if (!context || !canInCase(context.policyContext, "case.read")) {
    return { outcome: "not_found" };
  }
  if (!canInCase(context.policyContext, action)) {
    await recordAuthorizationDenied({
      organizationId: context.found.organizationId,
      caseId,
      actorId: authContext.user.id,
      attemptedAction: action,
      resourceType: "evidence",
      context: auditContext,
    });
    return { outcome: "forbidden" };
  }
  return { outcome: "ok", context };
}

export async function listEvidence(
  authContext: AuthContext,
  caseId: string,
  query: ListEvidenceQuery,
  auditContext: AuditContext,
): Promise<
  | { outcome: "ok"; data: EvidenceItemView[]; nextCursor?: string }
  | { outcome: "invalid_cursor" }
  | AccessDenied
> {
  const access = await authorizeCaseAction(
    authContext,
    caseId,
    "evidence.read",
    auditContext,
  );
  if (access.outcome !== "ok") return access;

  const where: Prisma.EvidenceItemWhereInput = { caseId };
  if (query.kind) where.kind = query.kind;
  if (query.status) where.status = query.status;
  if (query.q) where.title = { contains: query.q, mode: "insensitive" };
  if (query.collectedFrom || query.collectedTo) {
    where.collectedAt = {
      ...(query.collectedFrom ? { gte: new Date(query.collectedFrom) } : {}),
      ...(query.collectedTo ? { lte: new Date(query.collectedTo) } : {}),
    };
  }

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    if (!cursor) return { outcome: "invalid_cursor" };
    const cursorDate = new Date(cursor.collectedAt);
    where.AND = [
      {
        OR: [
          { collectedAt: { lt: cursorDate } },
          { collectedAt: cursorDate, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const items = await database.evidenceItem.findMany({
    where,
    include: evidenceInclude,
    orderBy: [{ collectedAt: "desc" }, { id: "desc" }],
    take: query.limit,
  });

  const last = items.at(-1);
  return {
    outcome: "ok",
    data: items.map(toEvidenceView),
    ...(items.length === query.limit && last
      ? {
          nextCursor: encodeCursor({
            collectedAt: last.collectedAt.toISOString(),
            id: last.id,
          }),
        }
      : {}),
  };
}

export async function getEvidence(
  authContext: AuthContext,
  caseId: string,
  evidenceId: string,
  auditContext: AuditContext,
): Promise<{ outcome: "ok"; evidence: EvidenceItemView } | AccessDenied> {
  const access = await authorizeCaseAction(
    authContext,
    caseId,
    "evidence.read",
    auditContext,
  );
  if (access.outcome !== "ok") return access;

  const item = await database.evidenceItem.findUnique({
    where: { id: evidenceId },
    include: evidenceInclude,
  });
  // Cross-case reads are not distinguishable from missing evidence.
  if (!item || item.caseId !== caseId) return { outcome: "not_found" };
  return { outcome: "ok", evidence: toEvidenceView(item) };
}

async function findByIdempotencyKey(caseId: string, idempotencyKey: string) {
  return database.evidenceItem.findUnique({
    where: { caseId_idempotencyKey: { caseId, idempotencyKey } },
    include: evidenceInclude,
  });
}

export async function createManualEvidence(
  authContext: AuthContext,
  caseId: string,
  input: CreateManualEvidenceInput,
  idempotencyKey: string,
  auditContext: AuditContext,
): Promise<
  { outcome: "created" | "exists"; evidence: EvidenceItemView } | AccessDenied
> {
  const access = await authorizeCaseAction(
    authContext,
    caseId,
    "evidence.create",
    auditContext,
  );
  if (access.outcome !== "ok") return access;

  const existing = await findByIdempotencyKey(caseId, idempotencyKey);
  if (existing)
    return { outcome: "exists", evidence: toEvidenceView(existing) };

  const now = new Date();
  try {
    const created = await database.$transaction(async (tx) => {
      const item = await tx.evidenceItem.create({
        data: {
          caseId,
          createdById: authContext.user.id,
          kind: "MANUAL",
          handlingLevel: input.handlingLevel,
          title: input.title,
          description: input.description ?? null,
          sourceUrl: input.sourceUrl ?? null,
          sourceMethod: "manual-entry",
          publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
          observedAt: input.observedAt ? new Date(input.observedAt) : null,
          analystNotes: input.analystNotes ?? null,
          rawMetadata: {},
          provenance: {
            method: "manual-entry",
            recordedById: authContext.user.id,
            recordedAt: now.toISOString(),
          },
          idempotencyKey,
        },
        include: evidenceInclude,
      });

      await recordAuditEvent(tx, {
        organizationId: access.context.found.organizationId,
        caseId,
        actorId: authContext.user.id,
        action: "evidence.created",
        resourceType: "evidence",
        resourceId: item.id,
        outcome: "success",
        metadata: { kind: "MANUAL", idempotencyKey },
        context: auditContext,
      });

      return item;
    });
    return { outcome: "created", evidence: toEvidenceView(created) };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await findByIdempotencyKey(caseId, idempotencyKey);
      if (winner)
        return { outcome: "exists", evidence: toEvidenceView(winner) };
    }
    throw error;
  }
}

// Counts bytes, hashes, and retains the leading bytes for content detection
// while the stream passes through to object storage.
function createInspectionStream() {
  const hash = createHash("sha256");
  const sampled: Buffer[] = [];
  let sampledBytes = 0;
  let byteCount = 0;

  const transform = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      byteCount += chunk.length;
      if (sampledBytes < MEDIA_TYPE_SAMPLE_BYTES) {
        const slice = chunk.subarray(0, MEDIA_TYPE_SAMPLE_BYTES - sampledBytes);
        sampled.push(slice);
        sampledBytes += slice.length;
      }
      callback(null, chunk);
    },
  });

  return {
    transform,
    digest: () => hash.digest("hex"),
    byteCount: () => byteCount,
    firstBytes: () => Buffer.concat(sampled),
  };
}

export type IngestFileResult =
  | { outcome: "created" | "exists"; evidence: EvidenceItemView }
  | { outcome: "too_large" }
  | { outcome: "empty_file" }
  | { outcome: "unsupported_type"; mediaType: string }
  | { outcome: "timeout" };

export interface IngestFileInput {
  stream: Readable;
  declaredFilename: string;
  declaredMediaType: string | undefined;
  wasTruncated: () => boolean;
  metadata: UploadEvidenceMetadata;
}

// Streaming ingestion: bytes flow through SHA-256 to a temporary object key,
// are verified, then promoted to an opaque immutable key in the same
// transaction that creates the evidence records. Every failure path removes
// the temporary object and leaves no durable evidence row.
export async function ingestFileEvidence(
  authContext: AuthContext,
  context: CaseContext,
  input: IngestFileInput,
  idempotencyKey: string,
  auditContext: AuditContext,
): Promise<IngestFileResult> {
  const caseId = context.found.id;
  const uploadId = randomUUID();
  const tempKey = `${TEMP_KEY_PREFIX}${uploadId}`;

  // Recorded before bytes are accepted so an interrupted transfer always
  // leaves a cleanup pointer to the temporary object.
  await database.upload.create({
    data: {
      id: uploadId,
      caseId,
      actorId: authContext.user.id,
      tempObjectKey: tempKey,
      idempotencyKey,
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

  const inspection = createInspectionStream();
  input.stream.once("error", (error) => inspection.transform.destroy(error));
  const body = input.stream.pipe(inspection.transform);

  try {
    await putObjectStream(
      tempKey,
      body,
      "application/octet-stream",
      config.UPLOAD_TIMEOUT_SECONDS * 1000,
    );
  } catch (error) {
    if (error instanceof UploadTimeoutError) {
      await failUpload("TIMEOUT");
      return { outcome: "timeout" };
    }
    await failUpload("STORAGE_ERROR");
    throw error;
  }

  if (input.wasTruncated()) {
    await failUpload("TOO_LARGE");
    return { outcome: "too_large" };
  }

  const byteSize = inspection.byteCount();
  if (byteSize === 0) {
    await failUpload("EMPTY_FILE");
    return { outcome: "empty_file" };
  }

  const sha256 = inspection.digest();
  const mediaType = await detectMediaType(
    inspection.firstBytes(),
    input.declaredMediaType,
  );
  if (!config.UPLOAD_ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    await failUpload("UNSUPPORTED_TYPE");
    return { outcome: "unsupported_type", mediaType };
  }

  // Reuse an existing blob with identical content instead of storing a copy.
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
  const title = input.metadata.title ?? input.declaredFilename;
  const now = new Date();

  try {
    const created = await database.$transaction(async (tx) => {
      const blob = await tx.evidenceBlob.upsert({
        where: { sha256_byteSize: { sha256, byteSize: BigInt(byteSize) } },
        create: {
          sha256,
          byteSize: BigInt(byteSize),
          mediaType,
          objectKey: finalKey,
          storageProvider: STORAGE_PROVIDER,
          bucket: storageBucket(),
          etag,
        },
        update: {},
      });

      const item = await tx.evidenceItem.create({
        data: {
          caseId,
          blobId: blob.id,
          createdById: authContext.user.id,
          kind: "FILE",
          handlingLevel: input.metadata.handlingLevel,
          title,
          description: input.metadata.description ?? null,
          originalFilename: input.declaredFilename,
          sourceUrl: input.metadata.sourceUrl ?? null,
          sourceMethod: "file-upload",
          publishedAt: input.metadata.publishedAt
            ? new Date(input.metadata.publishedAt)
            : null,
          observedAt: input.metadata.observedAt
            ? new Date(input.metadata.observedAt)
            : null,
          analystNotes: input.metadata.analystNotes ?? null,
          rawMetadata: {
            declaredMediaType: normalizeDeclaredType(input.declaredMediaType),
          },
          provenance: {
            method: "file-upload",
            uploadId,
            uploadedById: authContext.user.id,
            uploadedAt: now.toISOString(),
            originalFilename: input.declaredFilename,
            declaredMediaType: normalizeDeclaredType(input.declaredMediaType),
            detectedMediaType: mediaType,
            sha256,
            byteSize,
          },
          idempotencyKey,
        },
        include: evidenceInclude,
      });

      await tx.upload.update({
        where: { id: uploadId },
        data: {
          status: "COMPLETED",
          observedBytes: BigInt(byteSize),
          completedAt: new Date(),
        },
      });

      await recordAuditEvent(tx, {
        organizationId: context.found.organizationId,
        caseId,
        actorId: authContext.user.id,
        action: "evidence.created",
        resourceType: "evidence",
        resourceId: item.id,
        outcome: "success",
        metadata: {
          kind: "FILE",
          idempotencyKey,
          sha256,
          byteSize,
          mediaType,
        },
        context: auditContext,
      });

      // A concurrent identical upload may have created the blob first; the
      // upsert then returns its row and our promoted copy is redundant.
      return { item, redundantCopy: copiedKey && blob.objectKey !== copiedKey };
    });

    if (created.redundantCopy && copiedKey) {
      await deleteObjectQuietly(copiedKey);
    }
    await deleteObjectQuietly(tempKey);
    return { outcome: "created", evidence: toEvidenceView(created.item) };
  } catch (error) {
    if (copiedKey) {
      const adopted = await database.evidenceBlob.findUnique({
        where: { objectKey: copiedKey },
      });
      if (!adopted) await deleteObjectQuietly(copiedKey);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      await failUpload("IDEMPOTENT_REPLAY");
      const winner = await findByIdempotencyKey(caseId, idempotencyKey);
      if (winner)
        return { outcome: "exists", evidence: toEvidenceView(winner) };
    }
    await failUpload("STORAGE_ERROR");
    throw error;
  }
}

export async function authorizeEvidenceCreate(
  authContext: AuthContext,
  caseId: string,
  auditContext: AuditContext,
): Promise<{ outcome: "ok"; context: CaseContext } | AccessDenied> {
  return authorizeCaseAction(
    authContext,
    caseId,
    "evidence.create",
    auditContext,
  );
}

export async function findExistingByIdempotencyKey(
  caseId: string,
  idempotencyKey: string,
): Promise<EvidenceItemView | null> {
  const existing = await findByIdempotencyKey(caseId, idempotencyKey);
  return existing ? toEvidenceView(existing) : null;
}

export async function updateEvidence(
  authContext: AuthContext,
  caseId: string,
  evidenceId: string,
  patch: UpdateEvidenceInput,
  expectedVersion: number,
  auditContext: AuditContext,
): Promise<
  | { outcome: "updated"; evidence: EvidenceItemView }
  | { outcome: "version_conflict"; currentVersion: number }
  | AccessDenied
> {
  const access = await authorizeCaseAction(
    authContext,
    caseId,
    "evidence.update",
    auditContext,
  );
  if (access.outcome !== "ok") return access;

  const item = await database.evidenceItem.findUnique({
    where: { id: evidenceId },
  });
  if (!item || item.caseId !== caseId) return { outcome: "not_found" };
  if (item.version !== expectedVersion) {
    return { outcome: "version_conflict", currentVersion: item.version };
  }

  const changes = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Prisma.EvidenceItemUpdateManyMutationInput;

  const updated = await database.$transaction(async (tx) => {
    const result = await tx.evidenceItem.updateMany({
      where: { id: evidenceId, caseId, version: expectedVersion },
      data: { ...changes, version: { increment: 1 } },
    });
    if (result.count === 0) return null;

    await recordAuditEvent(tx, {
      organizationId: access.context.found.organizationId,
      caseId,
      actorId: authContext.user.id,
      action: "evidence.updated",
      resourceType: "evidence",
      resourceId: evidenceId,
      outcome: "success",
      metadata: { changedFields: Object.keys(patch) },
      context: auditContext,
    });

    return tx.evidenceItem.findUnique({
      where: { id: evidenceId },
      include: evidenceInclude,
    });
  });

  if (!updated) {
    const current = await database.evidenceItem.findUnique({
      where: { id: evidenceId },
    });
    return {
      outcome: "version_conflict",
      currentVersion: current?.version ?? expectedVersion,
    };
  }

  return { outcome: "updated", evidence: toEvidenceView(updated) };
}

export async function createEvidenceDownload(
  authContext: AuthContext,
  caseId: string,
  evidenceId: string,
  auditContext: AuditContext,
): Promise<
  | { outcome: "ok"; download: EvidenceDownload }
  | { outcome: "no_content" }
  | AccessDenied
> {
  const access = await authorizeCaseAction(
    authContext,
    caseId,
    "evidence.download",
    auditContext,
  );
  if (access.outcome !== "ok") return access;

  const item = await database.evidenceItem.findUnique({
    where: { id: evidenceId },
    include: { blob: true },
  });
  if (!item || item.caseId !== caseId) return { outcome: "not_found" };
  if (!item.blob) return { outcome: "no_content" };

  const filename = item.originalFilename ?? `${item.id}.bin`;
  const expiresAt = new Date(
    Date.now() + config.DOWNLOAD_URL_TTL_SECONDS * 1000,
  );
  const url = await presignDownload(item.blob.objectKey, {
    filename,
    mediaType: item.blob.mediaType,
    expiresInSeconds: config.DOWNLOAD_URL_TTL_SECONDS,
  });

  // Content-exposing access is always audited.
  await recordAuditEvent(database, {
    organizationId: access.context.found.organizationId,
    caseId,
    actorId: authContext.user.id,
    action: "evidence.downloaded",
    resourceType: "evidence",
    resourceId: item.id,
    outcome: "success",
    metadata: { sha256: item.blob.sha256, filename },
    context: auditContext,
  });

  return {
    outcome: "ok",
    download: { url, expiresAt: expiresAt.toISOString(), filename },
  };
}
