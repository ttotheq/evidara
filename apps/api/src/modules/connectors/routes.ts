import {
  listConnectorJobsQuerySchema,
  queueConnectorJobSchema,
} from "@evidara/contracts";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { auditContextFrom } from "../../lib/audit.js";
import { requireAuthContext } from "../../plugins/authentication.js";
import {
  getConnectorJob,
  listConnectorJobs,
  listConnectors,
  queueConnectorJob,
  retryConnectorJob,
} from "./service.js";

const caseParamsSchema = z.object({ caseId: z.string().uuid() });
const jobParamsSchema = caseParamsSchema.extend({
  jobId: z.string().uuid(),
});
const idempotencyHeaderSchema = z.object({
  "idempotency-key": z.string().min(8).max(200),
});

function sendNotFound(reply: FastifyReply) {
  return reply.status(404).send({
    error: { code: "NOT_FOUND", message: "Job or case not found." },
  });
}

function sendForbidden(reply: FastifyReply, message: string) {
  return reply.status(403).send({
    error: { code: "FORBIDDEN", message },
  });
}

export const registerConnectorRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/connectors", async (request) => {
    requireAuthContext(request);
    return { data: listConnectors() };
  });

  app.post(
    "/cases/:caseId/connector-jobs",
    {
      schema: {
        params: caseParamsSchema,
        headers: idempotencyHeaderSchema,
        body: queueConnectorJobSchema,
      },
    },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await queueConnectorJob(
        authContext,
        request.params.caseId,
        request.body,
        request.headers["idempotency-key"],
        auditContextFrom(request),
      );
      switch (result.outcome) {
        case "not_found":
          return sendNotFound(reply);
        case "forbidden":
          return sendForbidden(
            reply,
            "You are not allowed to run connectors in this case.",
          );
        case "unknown_connector":
          return reply.status(400).send({
            error: {
              code: "UNKNOWN_CONNECTOR",
              message: "The requested connector does not exist.",
            },
          });
        case "invalid_target":
          return reply.status(400).send({
            error: { code: "INVALID_TARGET", message: result.message },
          });
        default:
          return reply
            .status(result.outcome === "created" ? 201 : 200)
            .send({ data: result.job });
      }
    },
  );

  app.get(
    "/cases/:caseId/connector-jobs",
    {
      schema: {
        params: caseParamsSchema,
        querystring: listConnectorJobsQuerySchema,
      },
    },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await listConnectorJobs(
        authContext,
        request.params.caseId,
        request.query,
        auditContextFrom(request),
      );
      switch (result.outcome) {
        case "not_found":
          return sendNotFound(reply);
        case "forbidden":
          return sendForbidden(
            reply,
            "You are not allowed to read jobs in this case.",
          );
        case "invalid_cursor":
          return reply.status(400).send({
            error: {
              code: "INVALID_CURSOR",
              message: "The cursor is not valid.",
            },
          });
        case "ok":
          return { data: result.data, nextCursor: result.nextCursor };
      }
    },
  );

  app.get(
    "/cases/:caseId/connector-jobs/:jobId",
    { schema: { params: jobParamsSchema } },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await getConnectorJob(
        authContext,
        request.params.caseId,
        request.params.jobId,
        auditContextFrom(request),
      );
      switch (result.outcome) {
        case "not_found":
          return sendNotFound(reply);
        case "forbidden":
          return sendForbidden(
            reply,
            "You are not allowed to read jobs in this case.",
          );
        case "ok":
          return { data: result.job };
      }
    },
  );

  app.post(
    "/cases/:caseId/connector-jobs/:jobId/retry",
    { schema: { params: jobParamsSchema } },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await retryConnectorJob(
        authContext,
        request.params.caseId,
        request.params.jobId,
        auditContextFrom(request),
      );
      switch (result.outcome) {
        case "not_found":
          return sendNotFound(reply);
        case "forbidden":
          return sendForbidden(
            reply,
            "You are not allowed to retry jobs in this case.",
          );
        case "not_retryable":
          return reply.status(409).send({
            error: {
              code: "JOB_NOT_RETRYABLE",
              message:
                "Only failed jobs with a retryable error and remaining attempts can be retried.",
            },
          });
        case "queued":
          return { data: result.job };
      }
    },
  );
};
