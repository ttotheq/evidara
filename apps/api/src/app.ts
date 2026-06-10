import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, {
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { createSchema, createYoga } from "graphql-yoga";
import { config } from "./config.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerCaseRoutes } from "./modules/cases/routes.js";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { authenticationPlugin } from "./plugins/authentication.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "development" ? "debug" : "info",
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "body.password",
        "body.token",
      ],
    },
    requestIdHeader: "x-request-id",
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet);
  await app.register(cors, {
    origin: config.WEB_URL,
    credentials: true,
  });
  await app.register(sensible);
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Evidara API",
        version: "0.1.0",
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  await app.register(authenticationPlugin);

  await registerHealthRoutes(app);

  const yoga = createYoga<{
    req: FastifyRequest;
    reply: FastifyReply;
  }>({
    graphqlEndpoint: "/graphql",
    graphiql: config.NODE_ENV === "development",
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        type Query {
          serviceName: String!
        }
      `,
      resolvers: {
        Query: {
          serviceName: () => "Evidara",
        },
      },
    }),
    logging: {
      debug: (...args) => args.forEach((argument) => app.log.debug(argument)),
      info: (...args) => args.forEach((argument) => app.log.info(argument)),
      warn: (...args) => args.forEach((argument) => app.log.warn(argument)),
      error: (...args) => args.forEach((argument) => app.log.error(argument)),
    },
  });

  app.route({
    url: yoga.graphqlEndpoint,
    method: ["GET", "POST", "OPTIONS"],
    config: { public: true },
    handler: (request, reply) =>
      yoga.handleNodeRequestAndResponse(request, reply, {
        req: request,
        reply,
      }),
  });

  await app.register(registerAuthRoutes, { prefix: "/v1" });
  await app.register(registerCaseRoutes, { prefix: "/v1" });

  app.setErrorHandler((error, request, reply) => {
    const normalizedError = error as Error & {
      statusCode?: number;
      code?: string;
    };
    request.log.error({ err: normalizedError }, "request failed");
    const statusCode = normalizedError.statusCode ?? 500;
    return reply.status(statusCode).send({
      error: {
        code: normalizedError.code ?? "INTERNAL_ERROR",
        message:
          statusCode >= 500
            ? "An unexpected error occurred."
            : normalizedError.message,
        requestId: request.id,
      },
    });
  });

  return app;
}
