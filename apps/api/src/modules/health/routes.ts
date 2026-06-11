import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { database } from "@evidara/database";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { config } from "../../config.js";

const CHECK_TIMEOUT_MS = 2_000;

interface CheckResult {
  ok: boolean;
  message?: string;
}

async function runCheck(check: () => Promise<unknown>): Promise<CheckResult> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("check timed out")),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "unknown failure",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function registerHealthRoutes(app: FastifyInstance) {
  const redis = new Redis(config.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  redis.on("error", (error) =>
    app.log.debug({ err: error }, "redis health client error"),
  );
  await redis.connect().catch(() => {
    // Readiness reports the failure; reconnection continues in the background.
  });

  const objectStorage = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
    },
  });

  app.addHook("onClose", async () => {
    redis.disconnect();
    objectStorage.destroy();
  });

  app.get("/health/live", { config: { public: true } }, async () => ({
    status: "ok",
  }));

  app.get(
    "/health/ready",
    { config: { public: true } },
    async (_request, reply) => {
      const [postgres, redisCheck, storage] = await Promise.all([
        runCheck(() => database.$queryRaw`SELECT 1`),
        runCheck(() => redis.ping()),
        runCheck(() =>
          objectStorage.send(
            new HeadBucketCommand({ Bucket: config.S3_BUCKET }),
          ),
        ),
      ]);

      const checks = {
        postgres,
        redis: redisCheck,
        objectStorage: storage,
      };
      const healthy = Object.values(checks).every((check) => check.ok);

      return reply
        .status(healthy ? 200 : 503)
        .send({ status: healthy ? "ok" : "unavailable", checks });
    },
  );
}
