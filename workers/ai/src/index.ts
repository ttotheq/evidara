import { database } from "@evidara/database";
import { Worker } from "bullmq";
import { z } from "zod";
import { config, redisConnectionFromUrl } from "./config.js";

const jobSchema = z.object({
  aiRunId: z.string().uuid(),
});

const connection = redisConnectionFromUrl(config.REDIS_URL);

const worker = new Worker(
  "ai-runs",
  async (queueJob) => {
    const { aiRunId } = jobSchema.parse(queueJob.data);
    const run = await database.aiRun.findUniqueOrThrow({
      where: { id: aiRunId },
    });

    if (config.AI_PROVIDER === "disabled") {
      throw new Error("AI is disabled by deployment policy");
    }

    await database.aiRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    // Provider adapters must return schema-validated suggestions with citations.
    throw new Error(`AI provider adapter not configured: ${run.provider}`);
  },
  {
    connection,
    concurrency: config.AI_CONCURRENCY,
  },
);

worker.on("failed", async (job, error) => {
  const parsed = job ? jobSchema.safeParse(job.data) : undefined;
  if (!parsed?.success) return;
  await database.aiRun.update({
    where: { id: parsed.data.aiRunId },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: error.message.slice(0, 2000),
    },
  });
});

const shutdown = async () => {
  await worker.close();
  await database.$disconnect();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
