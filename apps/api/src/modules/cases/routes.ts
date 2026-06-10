import { createCaseRequestSchema, paginationSchema } from "@evidara/contracts";
import { database } from "@evidara/database";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  canInOrganization,
} from "../../authorization/policy.js";
import {
  organizationRoleFor,
  requireAuthContext,
} from "../../plugins/authentication.js";

export const registerCaseRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/cases",
    {
      schema: {
        querystring: paginationSchema,
      },
    },
    async (request) => {
      const authContext = requireAuthContext(request);
      const memberOrganizationIds = authContext.memberships.map(
        (membership) => membership.organizationId,
      );
      const oversightOrganizationIds = authContext.memberships
        .filter(
          (membership) =>
            membership.role === "OWNER" || membership.role === "ADMIN",
        )
        .map((membership) => membership.organizationId);

      const cases = await database.case.findMany({
        where: {
          organizationId: { in: memberOrganizationIds },
          OR: [
            { members: { some: { userId: authContext.user.id } } },
            {
              organizationId: { in: oversightOrganizationIds },
              handlingLevel: { not: "RESTRICTED" },
            },
          ],
        },
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
        headers: z.object({
          "idempotency-key": z.string().min(8).max(200),
        }),
        body: createCaseRequestSchema,
      },
    },
    async (request, reply) => {
      const authContext = requireAuthContext(request);
      const input = request.body;

      const organizationRole = organizationRoleFor(
        authContext,
        input.organizationId,
      );
      if (!canInOrganization({ organizationRole }, "case.create")) {
        return reply.status(403).send({
          error: {
            code: "FORBIDDEN",
            message: "You are not allowed to create cases in this organization.",
          },
        });
      }

      const created = await database.$transaction(async (tx) => {
        const newCase = await tx.case.create({
          data: {
            organizationId: input.organizationId,
            createdById: authContext.user.id,
            name: input.name,
            objective: input.objective,
            scope: input.scope,
            justification: input.justification,
            prohibitedCollection: input.prohibitedCollection,
            handlingLevel: input.handlingLevel,
            members: {
              create: {
                userId: authContext.user.id,
                role: "OWNER",
              },
            },
          },
        });

        await tx.auditEvent.create({
          data: {
            organizationId: input.organizationId,
            caseId: newCase.id,
            actorId: authContext.user.id,
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
