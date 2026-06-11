import {
  auditActionSchema,
  auditMetadataSchema,
  type AuditAction,
  type AuditMetadata,
  type AuditOutcome,
} from "@evidara/contracts";
import { database, type Prisma } from "@evidara/database";
import type { FastifyRequest } from "fastify";
import { config } from "../config.js";
import { hashIpAddress } from "./tokens.js";

// Request-derived context every audit write carries. The IP address is
// stored only as a keyed hash, mirroring session records.
export interface AuditContext {
  requestId: string;
  ipHash: string | null;
}

export function auditContextFrom(request: FastifyRequest): AuditContext {
  return {
    requestId: request.id,
    ipHash: hashIpAddress(request.ip, config.SESSION_SECRET),
  };
}

type DatabaseClient = Prisma.TransactionClient | typeof database;

export interface AuditEventInput {
  organizationId: string;
  caseId?: string | null;
  actorId?: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  metadata?: AuditMetadata;
  context: AuditContext;
}

// The single write path for audit events. The action must come from the
// validated registry and metadata must be scalar display values — both are
// enforced here so a stray write cannot smuggle secrets or free-form blobs.
export async function recordAuditEvent(
  client: DatabaseClient,
  input: AuditEventInput,
): Promise<void> {
  await client.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      caseId: input.caseId ?? null,
      actorId: input.actorId ?? null,
      action: auditActionSchema.parse(input.action),
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      outcome: input.outcome,
      requestId: input.context.requestId,
      ipHash: input.context.ipHash,
      metadata: auditMetadataSchema.parse(input.metadata ?? {}),
    },
  });
}

// Denied authorization attempts are security-relevant and logged uniformly,
// outside any transaction (the denied mutation never starts one).
export async function recordAuthorizationDenied(input: {
  organizationId: string;
  caseId?: string | null;
  actorId: string;
  attemptedAction: string;
  resourceType: string;
  resourceId?: string | null;
  context: AuditContext;
}): Promise<void> {
  await recordAuditEvent(database, {
    organizationId: input.organizationId,
    caseId: input.caseId ?? null,
    actorId: input.actorId,
    action: "authorization.denied",
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    outcome: "denied",
    metadata: { attemptedAction: input.attemptedAction },
    context: input.context,
  }).catch(() => {
    // Denial logging must never turn an authorization decision into a 500.
  });
}
