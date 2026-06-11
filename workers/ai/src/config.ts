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
  AI_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  AI_PROVIDER: z.string().min(1).default("disabled"),
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

export function redisConnectionFromUrl(rawUrl: string) {
  const redisUrl = new URL(rawUrl);
  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    ...(redisUrl.username ? { username: redisUrl.username } : {}),
    ...(redisUrl.password ? { password: redisUrl.password } : {}),
    maxRetriesPerRequest: null,
  };
}
