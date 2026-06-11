import type {
  AuditEventView,
  AuditMetadata,
  ListAuditEventsQuery,
} from "@evidara/contracts";
import { database, type Prisma } from "@evidara/database";
import { canInCase } from "../../authorization/policy.js";
import {
  type AuditContext,
  recordAuthorizationDenied,
} from "../../lib/audit.js";
import type { AuthContext } from "../../plugins/authentication.js";
import { loadCaseContext } from "../cases/service.js";

type AccessDenied = { outcome: "not_found" } | { outcome: "forbidden" };

interface Cursor {
  createdAt: string;
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
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    if (Number.isNaN(Date.parse(parsed.createdAt))) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

const eventInclude = {
  actor: { select: { id: true, displayName: true } },
} satisfies Prisma.AuditEventInclude;

type EventRecord = Prisma.AuditEventGetPayload<{
  include: typeof eventInclude;
}>;

// Maps a stored event to the response contract. The IP hash stays
// server-side; metadata was allowlisted at write time.
function toEventView(event: EventRecord): AuditEventView {
  return {
    id: event.id,
    action: event.action as AuditEventView["action"],
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    outcome: event.outcome as AuditEventView["outcome"],
    requestId: event.requestId,
    actor: event.actor
      ? { id: event.actor.id, displayName: event.actor.displayName }
      : null,
    metadata: (event.metadata as AuditMetadata | null) ?? {},
    createdAt: event.createdAt.toISOString(),
  };
}

export async function listAuditEvents(
  authContext: AuthContext,
  caseId: string,
  query: ListAuditEventsQuery,
  auditContext: AuditContext,
): Promise<
  | { outcome: "ok"; data: AuditEventView[]; nextCursor?: string }
  | { outcome: "invalid_cursor" }
  | AccessDenied
> {
  const context = await loadCaseContext(authContext, caseId);
  // Unreadable cases return not_found to prevent case-ID enumeration.
  if (!context || !canInCase(context.policyContext, "case.read")) {
    return { outcome: "not_found" };
  }
  if (!canInCase(context.policyContext, "audit.read")) {
    await recordAuthorizationDenied({
      organizationId: context.found.organizationId,
      caseId,
      actorId: authContext.user.id,
      attemptedAction: "audit.read",
      resourceType: "audit",
      context: auditContext,
    });
    return { outcome: "forbidden" };
  }

  const where: Prisma.AuditEventWhereInput = { caseId };
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    if (!cursor) return { outcome: "invalid_cursor" };
    const cursorDate = new Date(cursor.createdAt);
    where.AND = [
      {
        OR: [
          { createdAt: { lt: cursorDate } },
          { createdAt: cursorDate, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const events = await database.auditEvent.findMany({
    where,
    include: eventInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit,
  });

  const last = events.at(-1);
  return {
    outcome: "ok",
    data: events.map(toEventView),
    ...(events.length === query.limit && last
      ? {
          nextCursor: encodeCursor({
            createdAt: last.createdAt.toISOString(),
            id: last.id,
          }),
        }
      : {}),
  };
}
