import { z } from "zod";

export const idSchema = z.string().uuid();
export const cursorSchema = z.string().min(1).optional();
export const handlingLevelSchema = z.enum([
  "PUBLIC",
  "INTERNAL",
  "SENSITIVE",
  "RESTRICTED",
]);
export const confidenceSchema = z.number().min(0).max(100);

export const paginationSchema = z.object({
  cursor: cursorSchema,
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type HandlingLevel = z.infer<typeof handlingLevelSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
