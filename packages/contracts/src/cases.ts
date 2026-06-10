import { z } from "zod";
import { handlingLevelSchema } from "./common.js";

export const caseStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);

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

export const caseSchema = createCaseSchema.extend({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  status: caseStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type CreateCaseRequest = z.infer<typeof createCaseRequestSchema>;
export type Case = z.infer<typeof caseSchema>;

