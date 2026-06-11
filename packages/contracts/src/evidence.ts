import { z } from "zod";
import { handlingLevelSchema, paginationSchema } from "./common.js";

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

export const collectionCompletenessSchema = z.enum([
  "COMPLETE",
  "TRUNCATED",
  "INCOMPLETE",
]);

export const createManualEvidenceSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1).max(10000).optional(),
  sourceUrl: z.string().url().max(2048).optional(),
  publishedAt: z.string().datetime().optional(),
  observedAt: z.string().datetime().optional(),
  handlingLevel: handlingLevelSchema.default("INTERNAL"),
  analystNotes: z.string().max(10000).optional(),
});

// Multipart text fields accompanying a file upload. Fields must precede the
// file part so they can be validated before any bytes are accepted.
export const uploadEvidenceMetadataSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().min(1).max(10000).optional(),
  sourceUrl: z.string().url().max(2048).optional(),
  publishedAt: z.string().datetime().optional(),
  observedAt: z.string().datetime().optional(),
  handlingLevel: handlingLevelSchema.default("INTERNAL"),
  analystNotes: z.string().max(10000).optional(),
});

export const updateEvidenceSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().min(1).max(10000).nullable(),
    analystNotes: z.string().max(10000).nullable(),
    status: evidenceStatusSchema,
    handlingLevel: handlingLevelSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const listEvidenceQuerySchema = paginationSchema.extend({
  kind: evidenceKindSchema.optional(),
  status: evidenceStatusSchema.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  collectedFrom: z.string().datetime().optional(),
  collectedTo: z.string().datetime().optional(),
});

// Content metadata only — object keys and bucket names are never exposed.
export const evidenceBlobSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  byteSize: z.number().int().nonnegative(),
  mediaType: z.string(),
});

export const evidenceItemSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  kind: evidenceKindSchema,
  status: evidenceStatusSchema,
  handlingLevel: handlingLevelSchema,
  title: z.string(),
  description: z.string().nullable(),
  originalFilename: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  canonicalUrl: z.string().nullable(),
  sourceMethod: z.string(),
  publishedAt: z.string().datetime().nullable(),
  observedAt: z.string().datetime().nullable(),
  collectedAt: z.string().datetime(),
  collectionCompleteness: collectionCompletenessSchema,
  analystNotes: z.string().nullable(),
  provenance: z.record(z.unknown()).nullable(),
  collectedBy: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
  }),
  blob: evidenceBlobSchema.nullable(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const evidenceListResponseSchema = z.object({
  data: z.array(evidenceItemSchema),
  nextCursor: z.string().optional(),
});

export const evidenceDownloadSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().datetime(),
  filename: z.string(),
});

export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;
export type CollectionCompleteness = z.infer<
  typeof collectionCompletenessSchema
>;
export type CreateManualEvidenceInput = z.infer<
  typeof createManualEvidenceSchema
>;
export type UploadEvidenceMetadata = z.infer<
  typeof uploadEvidenceMetadataSchema
>;
export type UpdateEvidenceInput = z.infer<typeof updateEvidenceSchema>;
export type ListEvidenceQuery = z.infer<typeof listEvidenceQuerySchema>;
export type EvidenceBlobView = z.infer<typeof evidenceBlobSchema>;
export type EvidenceItemView = z.infer<typeof evidenceItemSchema>;
export type EvidenceListResponse = z.infer<typeof evidenceListResponseSchema>;
export type EvidenceDownload = z.infer<typeof evidenceDownloadSchema>;
