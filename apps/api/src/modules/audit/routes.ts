import { listAuditEventsQuerySchema } from "@evidara/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { auditContextFrom } from "../../lib/audit.js";
import { requireAuthContext } from "../../plugins/authentication.js";
import { listAuditEvents } from "./service.js";

const caseParamsSchema = z.object({ caseId: z.string().uuid() });

// Read-only by design: the audit history has no create, update, or delete
// route, and must never gain one.
export const registerAuditRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/cases/:caseId/audit-events",
    {
      schema: {
        params: caseParamsSchema,
        querystring: listAuditEventsQuerySchema,
      },
    },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await listAuditEvents(
        authContext,
        request.params.caseId,
        request.query,
        auditContextFrom(request),
      );
      switch (result.outcome) {
        case "not_found":
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "Case not found." },
          });
        case "forbidden":
          return reply.status(403).send({
            error: {
              code: "FORBIDDEN",
              message: "You are not allowed to read this case's audit log.",
            },
          });
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
};
