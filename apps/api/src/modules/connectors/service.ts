import type {
  ConnectorJobView,
  ConnectorManifestView,
  ListConnectorJobsQuery,
  QueueConnectorJobInput,
} from "@evidara/contracts";
import {
  classifyAddress,
  getConnectorManifest,
  isIpLiteral,
  listConnectorManifests,
  normalizeTargetUrl,
  WEB_PAGE_CAPTURE_KEY,
} from "@evidara/connectors-sdk";
import { database, Prisma } from "@evidara/database";
import { canInCase } from "../../authorization/policy.js";
import { enqueueConnectorJob } from "../../lib/connector-queue.js";
import type { AuthContext } from "../../plugins/authentication.js";
import { loadCaseContext } from "../cases/service.js";

export const MAX_JOB_ATTEMPTS = 5;

type CaseContext = NonNullable<Awaited<ReturnType<typeof loadCaseContext>>>;
type AccessDenied = { outcome: "not_found" } | { outcome: "forbidden" };

interface Cursor {
  queuedAt: string;
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
    if (typeof parsed.queuedAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    if (Number.isNaN(Date.parse(parsed.queuedAt))) return null;
    return { queuedAt: parsed.queuedAt, id: parsed.id };
  } catch {
    return null;
  }
}

const jobInclude = {
  requestedBy: { select: { id: true, displayName: true } },
  attempts: { orderBy: { attemptNumber: "asc" as const } },
} satisfies Prisma.ConnectorJobInclude;

type JobRecord = Prisma.ConnectorJobGetPayload<{ include: typeof jobInclude }>;

// A failed job can be retried when its last attempt was classified
// retryable and the attempt budget is not exhausted.
function isRetryable(job: JobRecord): boolean {
  if (job.status !== "FAILED") return false;
  if (job.attemptCount >= MAX_JOB_ATTEMPTS) return false;
  const lastAttempt = job.attempts.at(-1);
  return lastAttempt?.retryable ?? false;
}

function toJobView(job: JobRecord): ConnectorJobView {
  return {
    id: job.id,
    caseId: job.caseId,
    connectorKey: job.connectorKey,
    connectorVersion: job.connectorVersion,
    targetSummary: job.targetSummary,
    status: job.status,
    progress: job.progress,
    statusMessage: job.statusMessage,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    attemptCount: job.attemptCount,
    retryable: isRetryable(job),
    resultEvidenceId: job.resultEvidenceId,
    requestedBy: {
      id: job.requestedBy.id,
      displayName: job.requestedBy.displayName,
    },
    queuedAt: job.queuedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    attempts: job.attempts.map((attempt) => ({
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt.toISOString(),
      completedAt: attempt.completedAt?.toISOString() ?? null,
      succeeded: attempt.succeeded,
      retryable: attempt.retryable,
      errorCode: attempt.errorCode,
      errorMessage: attempt.errorMessage,
    })),
  };
}

export function listConnectors(): ConnectorManifestView[] {
  return listConnectorManifests().map((manifest) => ({
    key: manifest.key,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    source: manifest.source,
    method: manifest.method,
    safetyClass: manifest.safetyClass,
    rateLimit: manifest.rateLimit,
  }));
}

async function authorizeCaseAction(
  authContext: AuthContext,
  caseId: string,
  action: "connector.run" | "connector.retry" | "evidence.read",
): Promise<{ outcome: "ok"; context: CaseContext } | AccessDenied> {
  const context = await loadCaseContext(authContext, caseId);
  // Unreadable cases return not_found to prevent case-ID enumeration.
  if (!context || !canInCase(context.policyContext, "case.read")) {
    return { outcome: "not_found" };
  }
  if (!canInCase(context.policyContext, action)) {
    return { outcome: "forbidden" };
  }
  return { outcome: "ok", context };
}

async function findJobByIdempotencyKey(caseId: string, idempotencyKey: string) {
  return database.connectorJob.findUnique({
    where: { caseId_idempotencyKey: { caseId, idempotencyKey } },
    include: jobInclude,
  });
}

export type QueueJobResult =
  | { outcome: "created" | "exists"; job: ConnectorJobView }
  | { outcome: "unknown_connector" }
  | { outcome: "invalid_target"; message: string }
  | AccessDenied;

export async function queueConnectorJob(
  authContext: AuthContext,
  caseId: string,
  input: QueueConnectorJobInput,
  idempotencyKey: string,
  requestId: string,
): Promise<QueueJobResult> {
  const access = await authorizeCaseAction(authContext, caseId, "connector.run");
  if (access.outcome !== "ok") return access;

  const manifest = getConnectorManifest(input.connectorKey);
  if (!manifest) return { outcome: "unknown_connector" };

  const target = manifest.inputSchema.safeParse(input.target);
  if (!target.success) {
    return {
      outcome: "invalid_target",
      message: target.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    };
  }

  // Cheap static checks (scheme, credentials, literal blocked addresses)
  // fail at submission; DNS-dependent validation stays in the worker, which
  // re-checks everything at fetch time anyway.
  let targetSummary: string | null = null;
  if (manifest.key === WEB_PAGE_CAPTURE_KEY) {
    const url = (target.data as { url: string }).url;
    const verdict = normalizeTargetUrl(url);
    if (!verdict.ok) {
      return { outcome: "invalid_target", message: verdict.reason };
    }
    if (
      isIpLiteral(verdict.url.hostname) &&
      classifyAddress(verdict.url.hostname).blocked
    ) {
      return {
        outcome: "invalid_target",
        message: "The target address is not allowed for collection.",
      };
    }
    targetSummary = verdict.url.toString();
  }

  const existing = await findJobByIdempotencyKey(caseId, idempotencyKey);
  if (existing) return { outcome: "exists", job: toJobView(existing) };

  try {
    const created = await database.$transaction(async (tx) => {
      const job = await tx.connectorJob.create({
        data: {
          caseId,
          requestedById: authContext.user.id,
          connectorKey: manifest.key,
          connectorVersion: manifest.version,
          input: target.data as Prisma.InputJsonValue,
          targetSummary,
          statusMessage: input.analystNotes ?? null,
          idempotencyKey,
        },
        include: jobInclude,
      });

      await tx.auditEvent.create({
        data: {
          organizationId: access.context.found.organizationId,
          caseId,
          actorId: authContext.user.id,
          action: "connector_job.queued",
          resourceType: "connector_job",
          resourceId: job.id,
          outcome: "success",
          requestId,
          metadata: {
            connectorKey: manifest.key,
            targetSummary,
            idempotencyKey,
          },
        },
      });

      return job;
    });

    await enqueueAfterCommit(created.id, 1);
    return { outcome: "created", job: toJobView(created) };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await findJobByIdempotencyKey(caseId, idempotencyKey);
      if (winner) return { outcome: "exists", job: toJobView(winner) };
    }
    throw error;
  }
}

// The queue write happens after the database commit so the worker can never
// observe a job id that does not exist yet. If Redis is unavailable the job
// is marked failed-retryable instead of staying QUEUED forever.
async function enqueueAfterCommit(jobId: string, attempt: number) {
  try {
    await enqueueConnectorJob(jobId, attempt);
  } catch {
    await database.connectorJob
      .update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorCode: "ENQUEUE_FAILED",
          errorMessage: "The job could not be handed to the worker queue.",
          attemptCount: { increment: 1 },
          attempts: {
            create: {
              attemptNumber: attempt,
              completedAt: new Date(),
              succeeded: false,
              retryable: true,
              errorCode: "ENQUEUE_FAILED",
              errorMessage: "The job could not be handed to the worker queue.",
            },
          },
        },
      })
      .catch(() => undefined);
  }
}

export async function listConnectorJobs(
  authContext: AuthContext,
  caseId: string,
  query: ListConnectorJobsQuery,
): Promise<
  | { outcome: "ok"; data: ConnectorJobView[]; nextCursor?: string }
  | { outcome: "invalid_cursor" }
  | AccessDenied
> {
  const access = await authorizeCaseAction(authContext, caseId, "evidence.read");
  if (access.outcome !== "ok") return access;

  const where: Prisma.ConnectorJobWhereInput = { caseId };
  if (query.status) where.status = query.status;

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    if (!cursor) return { outcome: "invalid_cursor" };
    const cursorDate = new Date(cursor.queuedAt);
    where.AND = [
      {
        OR: [
          { queuedAt: { lt: cursorDate } },
          { queuedAt: cursorDate, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const jobs = await database.connectorJob.findMany({
    where,
    include: jobInclude,
    orderBy: [{ queuedAt: "desc" }, { id: "desc" }],
    take: query.limit,
  });

  const last = jobs.at(-1);
  return {
    outcome: "ok",
    data: jobs.map(toJobView),
    ...(jobs.length === query.limit && last
      ? {
          nextCursor: encodeCursor({
            queuedAt: last.queuedAt.toISOString(),
            id: last.id,
          }),
        }
      : {}),
  };
}

export async function getConnectorJob(
  authContext: AuthContext,
  caseId: string,
  jobId: string,
): Promise<{ outcome: "ok"; job: ConnectorJobView } | AccessDenied> {
  const access = await authorizeCaseAction(authContext, caseId, "evidence.read");
  if (access.outcome !== "ok") return access;

  const job = await database.connectorJob.findUnique({
    where: { id: jobId },
    include: jobInclude,
  });
  // Cross-case reads are not distinguishable from missing jobs.
  if (!job || job.caseId !== caseId) return { outcome: "not_found" };
  return { outcome: "ok", job: toJobView(job) };
}

export async function retryConnectorJob(
  authContext: AuthContext,
  caseId: string,
  jobId: string,
  requestId: string,
): Promise<
  | { outcome: "queued"; job: ConnectorJobView }
  | { outcome: "not_retryable" }
  | AccessDenied
> {
  const access = await authorizeCaseAction(
    authContext,
    caseId,
    "connector.retry",
  );
  if (access.outcome !== "ok") return access;

  const job = await database.connectorJob.findUnique({
    where: { id: jobId },
    include: jobInclude,
  });
  if (!job || job.caseId !== caseId) return { outcome: "not_found" };
  if (!isRetryable(job)) return { outcome: "not_retryable" };

  const nextAttempt = job.attemptCount + 1;
  const requeued = await database.$transaction(async (tx) => {
    // The status predicate makes concurrent retries race safely: only one
    // request moves the job back to QUEUED.
    const result = await tx.connectorJob.updateMany({
      where: { id: jobId, status: "FAILED" },
      data: {
        status: "QUEUED",
        progress: 0,
        statusMessage: null,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        queuedAt: new Date(),
      },
    });
    if (result.count === 0) return null;

    await tx.auditEvent.create({
      data: {
        organizationId: access.context.found.organizationId,
        caseId,
        actorId: authContext.user.id,
        action: "connector_job.retried",
        resourceType: "connector_job",
        resourceId: jobId,
        outcome: "success",
        requestId,
        metadata: { connectorKey: job.connectorKey, attemptNumber: nextAttempt },
      },
    });

    return tx.connectorJob.findUnique({
      where: { id: jobId },
      include: jobInclude,
    });
  });

  if (!requeued) return { outcome: "not_retryable" };

  await enqueueAfterCommit(jobId, nextAttempt);
  const refreshed = await database.connectorJob.findUnique({
    where: { id: jobId },
    include: jobInclude,
  });
  return { outcome: "queued", job: toJobView(refreshed ?? requeued) };
}
