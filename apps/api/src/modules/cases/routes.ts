import {
  createCaseRequestSchema,
  listCasesQuerySchema,
  updateCaseSchema,
} from "@evidara/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { auditContextFrom } from "../../lib/audit.js";
import { requireAuthContext } from "../../plugins/authentication.js";
import {
  createCase,
  getCase,
  listCases,
  updateCase,
} from "./service.js";

const caseParamsSchema = z.object({ caseId: z.string().uuid() });

export const registerCaseRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/cases",
    { schema: { querystring: listCasesQuerySchema } },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await listCases(authContext, request.query);
      if (!result.ok) {
        return reply.status(400).send({
          error: { code: "INVALID_CURSOR", message: "The cursor is not valid." },
        });
      }
      return { data: result.data, nextCursor: result.nextCursor };
    },
  );

  app.post(
    "/cases",
    {
      schema: {
        headers: z.object({
          "idempotency-key": z.string().min(8).max(200),
        }),
        body: createCaseRequestSchema,
      },
    },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await createCase(
        authContext,
        request.body,
        request.headers["idempotency-key"],
        auditContextFrom(request),
      );

      if (result.outcome === "forbidden") {
        return reply.status(403).send({
          error: {
            code: "FORBIDDEN",
            message: "You are not allowed to create cases in this organization.",
          },
        });
      }

      return reply
        .status(result.outcome === "created" ? 201 : 200)
        .send({ data: result.case });
    },
  );

  app.get(
    "/cases/:caseId",
    { schema: { params: caseParamsSchema } },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const detail = await getCase(authContext, request.params.caseId);
      if (!detail) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Case not found." },
        });
      }
      return { data: detail };
    },
  );

  app.patch(
    "/cases/:caseId",
    {
      schema: {
        params: caseParamsSchema,
        headers: z.object({
          "if-match": z.coerce.number().int().positive(),
        }),
        body: updateCaseSchema,
      },
    },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const result = await updateCase(
        authContext,
        request.params.caseId,
        request.body,
        request.headers["if-match"],
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
              message: "You are not allowed to update this case.",
            },
          });
        case "version_conflict":
          return reply.status(412).send({
            error: {
              code: "VERSION_CONFLICT",
              message:
                "The case changed since you loaded it. Reload and retry.",
              currentVersion: result.currentVersion,
            },
          });
        case "updated":
          return { data: result.case };
      }
    },
  );
};
