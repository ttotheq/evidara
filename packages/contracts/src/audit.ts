import { z } from "zod";
import { paginationSchema } from "./common.js";

// The validated registry of audit action names. Every audit write — API or
// worker — must use one of these; denied authorization attempts share the
// single "authorization.denied" action with the attempted action in metadata.
export const AUDIT_ACTIONS = [
  "auth.login",
  "auth.logout",
  "authorization.denied",
  "case.created",
  "case.updated",
  "evidence.created",
  "evidence.updated",
  "evidence.downloaded",
  "connector_job.queued",
  "connector_job.retried",
  "connector_job.succeeded",
  "connector_job.failed",
] as const;

export const auditActionSchema = z.enum(AUDIT_ACTIONS);

export const auditOutcomeSchema = z.enum(["success", "failure", "denied"]);

// Metadata is allowlisted at write time: scalar display values only, never
// secrets, evidence content, raw payloads, or storage details.
export const auditMetadataSchema = z.record(
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.string()),
  ]),
);

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  action: auditActionSchema,
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  outcome: auditOutcomeSchema,
  requestId: z.string().nullable(),
  actor: z
    .object({
      id: z.string().uuid(),
      displayName: z.string(),
    })
    .nullable(),
  metadata: auditMetadataSchema,
  createdAt: z.string().datetime(),
});

export const listAuditEventsQuerySchema = paginationSchema;

export const auditEventListResponseSchema = z.object({
  data: z.array(auditEventSchema),
  nextCursor: z.string().optional(),
});

export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditOutcome = z.infer<typeof auditOutcomeSchema>;
export type AuditMetadata = z.infer<typeof auditMetadataSchema>;
export type AuditEventView = z.infer<typeof auditEventSchema>;
export type ListAuditEventsQuery = z.infer<typeof listAuditEventsQuerySchema>;
export type AuditEventListResponse = z.infer<
  typeof auditEventListResponseSchema
>;
