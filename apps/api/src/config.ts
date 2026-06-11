import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

// Values already present in the process environment take precedence over the file.
function loadEnvironmentFile() {
  const fileName = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
  let directory = process.cwd();
  for (;;) {
    const candidate = join(directory, fileName);
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

loadEnvironmentFile();

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1)
    .default(25 * 1024 * 1024),
  UPLOAD_ALLOWED_MEDIA_TYPES: z
    .string()
    .default(
      [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "text/plain",
        "text/csv",
        "application/json",
      ].join(","),
    )
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),
  UPLOAD_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(3600).default(120),
  DOWNLOAD_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(10)
    .max(600)
    .default(60),
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(
    `Invalid environment configuration:\n${issues}\n` +
      "Copy .env.example to .env and adjust values, or export the variables.",
  );
  process.exit(1);
}

export const config = parsed.data;
