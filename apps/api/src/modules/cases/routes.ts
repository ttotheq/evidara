import { createCaseSchema, paginationSchema } from "@evidara/contracts";
import { database } from "@evidara/database";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

const requestContextSchema = z.object({
  "x-organization-id": z.string().uuid(),
  "x-user-id": z.string().uuid(),
});

export const registerCaseRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/cases",
    {
      schema: {
        headers: requestContextSchema,
        querystring: paginationSchema,
      },
    },
    async (request) => {
      const organizationId = request.headers["x-organization-id"];
      const cases = await database.case.findMany({
        where: { organizationId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: request.query.limit,
      });

      return {
        data: cases,
        nextCursor:
          cases.length === request.query.limit ? cases.at(-1)?.id : undefined,
      };
    },
  );

  app.post(
    "/cases",
    {
      schema: {
        headers: requestContextSchema.extend({
          "idempotency-key": z.string().min(8).max(200),
        }),
        body: createCaseSchema,
      },
    },
    async (request, reply) => {
      const organizationId = request.headers["x-organization-id"];
      const userId = request.headers["x-user-id"];
      const input = request.body;

      const created = await database.$transaction(async (tx) => {
        const newCase = await tx.case.create({
          data: {
            organizationId,
            createdById: userId,
            name: input.name,
            objective: input.objective,
            scope: input.scope,
            justification: input.justification,
            prohibitedCollection: input.prohibitedCollection,
            handlingLevel: input.handlingLevel,
            members: {
              create: {
                userId,
                role: "OWNER",
              },
            },
          },
        });

        await tx.auditEvent.create({
          data: {
            organizationId,
            caseId: newCase.id,
            actorId: userId,
            action: "case.created",
            resourceType: "case",
            resourceId: newCase.id,
            outcome: "success",
            requestId: request.id,
            metadata: {
              idempotencyKey: request.headers["idempotency-key"],
            },
          },
        });

        return newCase;
      });

      return reply.status(201).send({ data: created });
    },
  );
};

