import { z } from "zod";
import { paginationSchema } from "./common.js";

export const jobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export const connectorSafetyClassSchema = z.enum(["LOW", "MODERATE", "HIGH"]);

// Public description of an available connector. Input requirements are
// documented per field; the server validates with the connector's own schema.
export const connectorManifestViewSchema = z.object({
  key: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  source: z.string(),
  method: z.string(),
  safetyClass: connectorSafetyClassSchema,
  rateLimit: z.object({
    requests: z.number().int().positive(),
    windowSeconds: z.number().int().positive(),
  }),
});

export const connectorListResponseSchema = z.object({
  data: z.array(connectorManifestViewSchema),
});

export const queueConnectorJobSchema = z.object({
  connectorKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  target: z.record(z.unknown()),
  analystNotes: z.string().max(5000).optional(),
});

export const listConnectorJobsQuerySchema = paginationSchema.extend({
  status: jobStatusSchema.optional(),
});

export const connectorAttemptSchema = z.object({
  attemptNumber: z.number().int().positive(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  succeeded: z.boolean().nullable(),
  retryable: z.boolean(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export const connectorJobSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  connectorKey: z.string(),
  connectorVersion: z.string(),
  targetSummary: z.string().nullable(),
  status: jobStatusSchema,
  progress: z.number().int().min(0).max(100),
  statusMessage: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  // True when a new attempt may be requested: the job failed, the failure is
  // classified retryable, and the attempt budget is not exhausted.
  retryable: z.boolean(),
  resultEvidenceId: z.string().uuid().nullable(),
  requestedBy: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
  }),
  queuedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  attempts: z.array(connectorAttemptSchema),
});

export const connectorJobListResponseSchema = z.object({
  data: z.array(connectorJobSchema),
  nextCursor: z.string().optional(),
});

export type JobStatus = z.infer<typeof jobStatusSchema>;
export type ConnectorSafetyClass = z.infer<typeof connectorSafetyClassSchema>;
export type ConnectorManifestView = z.infer<typeof connectorManifestViewSchema>;
export type ConnectorListResponse = z.infer<typeof connectorListResponseSchema>;
export type QueueConnectorJobInput = z.infer<typeof queueConnectorJobSchema>;
export type ListConnectorJobsQuery = z.infer<
  typeof listConnectorJobsQuerySchema
>;
export type ConnectorAttemptView = z.infer<typeof connectorAttemptSchema>;
export type ConnectorJobView = z.infer<typeof connectorJobSchema>;
export type ConnectorJobListResponse = z.infer<
  typeof connectorJobListResponseSchema
>;
