import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function loadEnvironmentFile() {
  let directory = process.cwd();
  for (;;) {
    const candidate = join(directory, ".env.test");
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

export default async function globalSetup() {
  process.env.NODE_ENV = "test";
  loadEnvironmentFile();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set after loading .env.test");
  }

  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run tests against "${databaseName}"; the test database name must end in "_test".`,
    );
  }

  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = "/postgres";

  const { PrismaClient } = await import("@prisma/client");
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    const existing = await admin.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM pg_database WHERE datname = '${databaseName.replaceAll("'", "''")}'`,
    );
    if (existing.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync("npx prisma migrate deploy", {
    cwd: resolve(import.meta.dirname, "../../../packages/database"),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  await ensureTestBucket();
  await drainTestQueue();
}

// Earlier runs (and API tests) leave queue entries no worker drained; clear
// them so a test worker cannot pick up stale jobs.
async function drainTestQueue() {
  const redisUrl = new URL(process.env.REDIS_URL ?? "");
  const { Queue } = await import("bullmq");
  const queue = new Queue("connector-jobs", {
    connection: {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      ...(redisUrl.pathname.length > 1
        ? { db: Number(redisUrl.pathname.slice(1)) }
        : {}),
    },
  });
  try {
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
  }
}

async function ensureTestBucket() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error("S3_BUCKET is not set after loading .env.test");
  }
  const { CreateBucketCommand, HeadBucketCommand, S3Client } = await import(
    "@aws-sdk/client-s3"
  );
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  } finally {
    client.destroy();
  }
}
