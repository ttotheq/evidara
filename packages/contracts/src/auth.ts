import { z } from "zod";
import { idSchema } from "./common.js";

export const organizationRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export const caseRoleSchema = z.enum([
  "OWNER",
  "ANALYST",
  "REVIEWER",
  "VIEWER",
]);

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(1024),
});

export const safeUserSchema = z.object({
  id: idSchema,
  email: z.string().email(),
  displayName: z.string(),
});

export const membershipSchema = z.object({
  organizationId: idSchema,
  organizationSlug: z.string(),
  organizationName: z.string(),
  role: organizationRoleSchema,
});

export const loginResponseSchema = z.object({
  data: z.object({
    user: safeUserSchema,
    csrfToken: z.string(),
  }),
});

export const meResponseSchema = z.object({
  data: z.object({
    user: safeUserSchema,
    memberships: z.array(membershipSchema),
  }),
});

export const csrfResponseSchema = z.object({
  data: z.object({
    csrfToken: z.string(),
  }),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type SafeUser = z.infer<typeof safeUserSchema>;
export type Membership = z.infer<typeof membershipSchema>;
