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
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  CONNECTOR_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  CAPTURE_MAX_REDIRECTS: z.coerce.number().int().min(0).max(20).default(5),
  CAPTURE_MAX_RESPONSE_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(10 * 1024 * 1024),
  CAPTURE_MAX_DECOMPRESSED_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(50 * 1024 * 1024),
  CAPTURE_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(300).default(30),
  CAPTURE_ALLOWED_CONTENT_TYPES: z
    .string()
    .default("text/html,application/xhtml+xml,text/plain")
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),
  CAPTURE_USER_AGENT: z
    .string()
    .min(1)
    .default("EvidaraCapture/1.0 (+https://github.com/evidara/evidara)"),
  // Exact "hostname:port" entries exempt from SSRF address classification.
  // For local test fixtures only; ignored outside development and test.
  CAPTURE_FIXTURE_ALLOWLIST: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
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

export const config = {
  ...parsed.data,
  CAPTURE_FIXTURE_ALLOWLIST:
    parsed.data.NODE_ENV === "production"
      ? []
      : parsed.data.CAPTURE_FIXTURE_ALLOWLIST,
};

export function redisConnectionFromUrl(rawUrl: string) {
  const redisUrl = new URL(rawUrl);
  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    ...(redisUrl.pathname.length > 1
      ? { db: Number(redisUrl.pathname.slice(1)) }
      : {}),
    ...(redisUrl.username ? { username: redisUrl.username } : {}),
    ...(redisUrl.password ? { password: redisUrl.password } : {}),
    maxRetriesPerRequest: null,
  };
}
