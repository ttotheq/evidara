import { z } from "zod";
import { caseRoleSchema } from "./auth.js";
import { handlingLevelSchema, paginationSchema } from "./common.js";

export const caseStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);

export const caseActionSchema = z.enum([
  "case.read",
  "case.update",
  "case.members.manage",
  "evidence.create",
  "evidence.read",
  "evidence.download",
  "connector.run",
  "connector.retry",
  "audit.read",
]);

export const createCaseSchema = z.object({
  name: z.string().trim().min(3).max(160),
  objective: z.string().trim().min(10).max(4000),
  scope: z.string().trim().min(10).max(8000),
  justification: z.string().trim().min(10).max(4000),
  handlingLevel: handlingLevelSchema.default("INTERNAL"),
  prohibitedCollection: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
});

export const createCaseRequestSchema = createCaseSchema.extend({
  organizationId: z.string().uuid(),
});

export const updateCaseSchema = z
  .object({
    name: z.string().trim().min(3).max(160),
    objective: z.string().trim().min(10).max(4000),
    scope: z.string().trim().min(10).max(8000),
    justification: z.string().trim().min(10).max(4000),
    handlingLevel: handlingLevelSchema,
    prohibitedCollection: z
      .array(z.string().trim().min(1).max(500))
      .max(50),
    status: caseStatusSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const listCasesQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
  status: caseStatusSchema.optional(),
});

export const caseSchema = createCaseSchema.extend({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  status: caseStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const caseDetailSchema = z.object({
  case: caseSchema,
  caseRole: caseRoleSchema.nullable(),
  permissions: z.array(caseActionSchema),
});

export type CaseAction = z.infer<typeof caseActionSchema>;
export type CaseStatus = z.infer<typeof caseStatusSchema>;
export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type CreateCaseRequest = z.infer<typeof createCaseRequestSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
export type ListCasesQuery = z.infer<typeof listCasesQuerySchema>;
export type Case = z.infer<typeof caseSchema>;
export type CaseDetail = z.infer<typeof caseDetailSchema>;
