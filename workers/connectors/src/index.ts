import { database } from "@evidara/database";
import { Worker } from "bullmq";
import { z } from "zod";
import { config, redisConnectionFromUrl } from "./config.js";
import { executeConnectorJob } from "./execute.js";

const jobSchema = z.object({
  connectorJobId: z.string().uuid(),
});

const connection = redisConnectionFromUrl(config.REDIS_URL);

const worker = new Worker(
  "connector-jobs",
  async (queueJob) => {
    const { connectorJobId } = jobSchema.parse(queueJob.data);
    // All failure handling happens inside the execution service so every
    // outcome lands as a ConnectorAttempt with a safe error code. A throw
    // here means the job row itself could not be updated.
    await executeConnectorJob(connectorJobId);
  },
  {
    connection,
    concurrency: config.CONNECTOR_CONCURRENCY,
  },
);

worker.on("failed", async (job, error) => {
  const parsed = job ? jobSchema.safeParse(job.data) : undefined;
  console.error(
    `connector job ${parsed?.success ? parsed.data.connectorJobId : "unknown"} failed outside the execution service: ${error.message}`,
  );
  if (!parsed?.success) return;
  await database.connectorJob
    .updateMany({
      where: { id: parsed.data.connectorJobId, status: "RUNNING" },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorCode: "CONNECTOR_EXECUTION_FAILED",
        errorMessage: "The connector failed unexpectedly.",
      },
    })
    .catch(() => undefined);
});

const shutdown = async () => {
  await worker.close();
  await database.$disconnect();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
