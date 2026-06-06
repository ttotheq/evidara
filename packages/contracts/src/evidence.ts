import { z } from "zod";
import { handlingLevelSchema } from "./common.js";

export const evidenceStatusSchema = z.enum([
  "UNREVIEWED",
  "VERIFIED",
  "DISPUTED",
  "STALE",
  "EXCLUDED",
]);

export const evidenceKindSchema = z.enum([
  "WEB_CAPTURE",
  "FILE",
  "MANUAL",
  "CONNECTOR_RESULT",
]);

export const createEvidenceMetadataSchema = z.object({
  title: z.string().trim().min(1).max(500),
  kind: evidenceKindSchema,
  sourceUrl: z.string().url().max(2048).optional(),
  publishedAt: z.string().datetime().optional(),
  handlingLevel: handlingLevelSchema.default("INTERNAL"),
  analystNotes: z.string().max(10000).optional(),
});

export const queueConnectorJobSchema = z.object({
  connectorKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  target: z.record(z.unknown()),
  analystNotes: z.string().max(5000).optional(),
});

export type QueueConnectorJobInput = z.infer<typeof queueConnectorJobSchema>;

