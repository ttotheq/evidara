import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import {
  API_PORT,
  API_URL,
  FIXTURE_PAGE_BODY,
  FIXTURE_PORT,
  WEB_PORT,
  WEB_URL,
} from "./stack.js";

const ROOT = resolve(import.meta.dirname, "..");

const children: ChildProcess[] = [];
let fixtureServer: Server | undefined;

function requireBuilt(path: string, hint: string) {
  if (!existsSync(join(ROOT, path))) {
    throw new Error(
      `${path} is missing. Run "npm run build" before the end-to-end tests (${hint}).`,
    );
  }
}

async function prepareDatabase() {
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

  const databaseDir = join(ROOT, "packages/database");
  execSync("npx prisma migrate deploy", {
    cwd: databaseDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  // Start every run from an empty, freshly seeded state.
  const client = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const tables = await client.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    if (tables.length > 0) {
      await client.$executeRawUnsafe(
        `TRUNCATE TABLE ${tables.map((table) => `"${table.tablename}"`).join(", ")} CASCADE`,
      );
    }
  } finally {
    await client.$disconnect();
  }

  execSync("npx tsx prisma/seed.ts", {
    cwd: databaseDir,
    env: { ...process.env, NODE_ENV: "test" },
    stdio: "inherit",
  });
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
    endpoint: process.env.S3_ENDPOINT ?? "",
    region: process.env.S3_REGION ?? "us-east-1",
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

// Stale entries from API integration test runs would otherwise be picked up
// by the live worker this suite starts.
async function drainQueue() {
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

function startFixtureServer(): Promise<void> {
  fixtureServer = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(FIXTURE_PAGE_BODY);
  });
  return new Promise((resolvePromise) =>
    fixtureServer?.listen(FIXTURE_PORT, resolvePromise),
  );
}

function startProcess(
  name: string,
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): ChildProcess {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group so teardown can kill the whole tree.
    detached: true,
  });
  const forward = (chunk: Buffer) => {
    process.stdout.write(`[${name}] ${chunk.toString()}`);
  };
  child.stdout?.on("data", forward);
  child.stderr?.on("data", forward);
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      process.stdout.write(`[${name}] exited with code ${code}\n`);
    }
  });
  children.push(child);
  return child;
}

async function waitForHttp(url: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${url}`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
}

async function stopEverything() {
  for (const child of children) {
    if (child.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // Already gone.
      }
    }
  }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  for (const child of children) {
    if (child.pid && child.exitCode === null) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }
  if (fixtureServer) {
    await new Promise<void>((resolvePromise) =>
      fixtureServer?.close(() => resolvePromise()),
    );
  }
}

export default async function globalSetup() {
  process.env.NODE_ENV = "test";
  process.loadEnvFile(join(ROOT, ".env.test"));

  requireBuilt("apps/api/dist/server.js", "API");
  requireBuilt("apps/web/.next", "web");
  requireBuilt("workers/connectors/dist/index.js", "connector worker");

  await prepareDatabase();
  await ensureTestBucket();
  await drainQueue();
  await startFixtureServer();

  try {
    startProcess("api", "node", ["dist/server.js"], join(ROOT, "apps/api"), {
      NODE_ENV: "test",
      PORT: String(API_PORT),
      WEB_URL,
    });
    startProcess(
      "web",
      join(ROOT, "node_modules/.bin/next"),
      ["start", "-p", String(WEB_PORT)],
      join(ROOT, "apps/web"),
      { API_URL },
    );
    startProcess(
      "worker",
      "node",
      ["dist/index.js"],
      join(ROOT, "workers/connectors"),
      {
        NODE_ENV: "test",
        CAPTURE_FIXTURE_ALLOWLIST: `localhost:${FIXTURE_PORT}`,
      },
    );

    await waitForHttp(`${API_URL}/health/ready`);
    await waitForHttp(`${WEB_URL}/login`);
  } catch (error) {
    await stopEverything();
    throw error;
  }

  return stopEverything;
}
