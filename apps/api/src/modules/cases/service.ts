import type {
  CreateCaseRequest,
  ListCasesQuery,
  UpdateCaseInput,
} from "@evidara/contracts";
import { database, Prisma } from "@evidara/database";
import {
  ALL_CASE_ACTIONS,
  canInCase,
  canInOrganization,
  type CaseAction,
} from "../../authorization/policy.js";
import {
  organizationRoleFor,
  type AuthContext,
} from "../../plugins/authentication.js";

interface Cursor {
  updatedAt: string;
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
    if (typeof parsed.updatedAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    if (Number.isNaN(Date.parse(parsed.updatedAt))) return null;
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    return null;
  }
}

// Visibility: explicit case membership, or organization OWNER/ADMIN
// oversight of non-RESTRICTED cases. Mirrors canInCase("case.read").
function visibleCasesWhere(authContext: AuthContext): Prisma.CaseWhereInput {
  const memberOrganizationIds = authContext.memberships.map(
    (membership) => membership.organizationId,
  );
  const oversightOrganizationIds = authContext.memberships
    .filter(
      (membership) =>
        membership.role === "OWNER" || membership.role === "ADMIN",
    )
    .map((membership) => membership.organizationId);

  return {
    organizationId: { in: memberOrganizationIds },
    OR: [
      { members: { some: { userId: authContext.user.id } } },
      {
        organizationId: { in: oversightOrganizationIds },
        handlingLevel: { not: "RESTRICTED" },
      },
    ],
  };
}

export async function listCases(
  authContext: AuthContext,
  query: ListCasesQuery,
): Promise<
  | { ok: true; data: unknown[]; nextCursor?: string }
  | { ok: false; error: "invalid_cursor" }
> {
  const where: Prisma.CaseWhereInput = { ...visibleCasesWhere(authContext) };

  if (query.q) {
    where.name = { contains: query.q, mode: "insensitive" };
  }
  if (query.status) {
    where.status = query.status;
  }

  if (query.cursor) {
    const cursor = decodeCursor(query.cursor);
    if (!cursor) return { ok: false, error: "invalid_cursor" };
    const cursorDate = new Date(cursor.updatedAt);
    where.AND = [
      {
        OR: [
          { updatedAt: { lt: cursorDate } },
          { updatedAt: cursorDate, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const cases = await database.case.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: query.limit,
  });

  const last = cases.at(-1);
  return {
    ok: true,
    data: cases,
    ...(cases.length === query.limit && last
      ? {
          nextCursor: encodeCursor({
            updatedAt: last.updatedAt.toISOString(),
            id: last.id,
          }),
        }
      : {}),
  };
}

export async function createCase(
  authContext: AuthContext,
  input: CreateCaseRequest,
  idempotencyKey: string,
  requestId: string,
): Promise<
  | { outcome: "created" | "exists"; case: unknown }
  | { outcome: "forbidden" }
> {
  const organizationRole = organizationRoleFor(
    authContext,
    input.organizationId,
  );
  if (!canInOrganization({ organizationRole }, "case.create")) {
    return { outcome: "forbidden" };
  }

  const existing = await database.case.findUnique({
    where: {
      organizationId_idempotencyKey: {
        organizationId: input.organizationId,
        idempotencyKey,
      },
    },
  });
  if (existing) {
    return { outcome: "exists", case: existing };
  }

  try {
    const created = await database.$transaction(async (tx) => {
      const newCase = await tx.case.create({
        data: {
          organizationId: input.organizationId,
          createdById: authContext.user.id,
          name: input.name,
          objective: input.objective,
          scope: input.scope,
          justification: input.justification,
          prohibitedCollection: input.prohibitedCollection,
          handlingLevel: input.handlingLevel,
          idempotencyKey,
          members: {
            create: {
              userId: authContext.user.id,
              role: "OWNER",
            },
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId: input.organizationId,
          caseId: newCase.id,
          actorId: authContext.user.id,
          action: "case.created",
          resourceType: "case",
          resourceId: newCase.id,
          outcome: "success",
          requestId,
          metadata: { idempotencyKey },
        },
      });

      return newCase;
    });
    return { outcome: "created", case: created };
  } catch (error) {
    // A concurrent request with the same idempotency key won the race.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const winner = await database.case.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey,
          },
        },
      });
      if (winner) return { outcome: "exists", case: winner };
    }
    throw error;
  }
}

async function loadCaseContext(authContext: AuthContext, caseId: string) {
  const found = await database.case.findUnique({
    where: { id: caseId },
    include: {
      members: { where: { userId: authContext.user.id }, take: 1 },
    },
  });
  if (!found) return null;

  const organizationRole = organizationRoleFor(
    authContext,
    found.organizationId,
  );
  const caseRole = found.members[0]?.role;
  const policyContext = {
    organizationRole,
    caseRole,
    handlingLevel: found.handlingLevel,
  };
  return { found, policyContext, caseRole };
}

export async function getCase(authContext: AuthContext, caseId: string) {
  const context = await loadCaseContext(authContext, caseId);
  if (!context || !canInCase(context.policyContext, "case.read")) {
    return null;
  }

  const permissions = ALL_CASE_ACTIONS.filter((action: CaseAction) =>
    canInCase(context.policyContext, action),
  );
  const { members: _members, ...caseRecord } = context.found;
  return {
    case: caseRecord,
    caseRole: context.caseRole ?? null,
    permissions,
  };
}

export async function updateCase(
  authContext: AuthContext,
  caseId: string,
  patch: UpdateCaseInput,
  expectedVersion: number,
  requestId: string,
): Promise<
  | { outcome: "updated"; case: unknown }
  | { outcome: "not_found" }
  | { outcome: "forbidden" }
  | { outcome: "version_conflict"; currentVersion: number }
> {
  const context = await loadCaseContext(authContext, caseId);
  if (!context || !canInCase(context.policyContext, "case.read")) {
    return { outcome: "not_found" };
  }
  if (!canInCase(context.policyContext, "case.update")) {
    return { outcome: "forbidden" };
  }
  if (context.found.version !== expectedVersion) {
    return { outcome: "version_conflict", currentVersion: context.found.version };
  }

  const changes = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Prisma.CaseUpdateManyMutationInput;

  const updated = await database.$transaction(async (tx) => {
    const result = await tx.case.updateMany({
      where: { id: caseId, version: expectedVersion },
      data: {
        ...changes,
        ...(patch.status === "ARCHIVED"
          ? { archivedAt: new Date() }
          : patch.status === "ACTIVE"
            ? { archivedAt: null }
            : {}),
        version: { increment: 1 },
      },
    });
    if (result.count === 0) return null;

    await tx.auditEvent.create({
      data: {
        organizationId: context.found.organizationId,
        caseId,
        actorId: authContext.user.id,
        action: "case.updated",
        resourceType: "case",
        resourceId: caseId,
        outcome: "success",
        requestId,
        metadata: { changedFields: Object.keys(patch) },
      },
    });

    return tx.case.findUnique({ where: { id: caseId } });
  });

  if (!updated) {
    const current = await database.case.findUnique({ where: { id: caseId } });
    return {
      outcome: "version_conflict",
      currentVersion: current?.version ?? expectedVersion,
    };
  }

  return { outcome: "updated", case: updated };
}
