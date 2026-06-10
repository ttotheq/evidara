import {
  csrfResponseSchema,
  errorResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  meResponseSchema,
} from "@evidara/contracts";
import { database } from "@evidara/database";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { config } from "../../config.js";
import {
  DUMMY_PASSWORD_HASH_PROMISE,
  verifyPassword,
} from "../../lib/passwords.js";
import { hashIpAddress } from "../../lib/tokens.js";
import {
  requireAuthContext,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../../plugins/authentication.js";
import {
  createSession,
  revokeSession,
  rotateCsrfToken,
} from "./sessions.js";

export const registerAuthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/auth/login",
    {
      config: { public: true },
      schema: {
        body: loginRequestSchema,
        response: { 200: loginResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await database.user.findUnique({ where: { email } });

      const passwordHash =
        user?.passwordHash ?? (await DUMMY_PASSWORD_HASH_PROMISE);
      const passwordValid = await verifyPassword(passwordHash, password);

      if (!user || !user.passwordHash || !passwordValid || user.disabledAt) {
        return reply.status(401).send({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password.",
          },
        });
      }

      const session = await createSession({
        userId: user.id,
        ipHash: hashIpAddress(request.ip, config.SESSION_SECRET),
        userAgent: request.headers["user-agent"],
      });

      reply.setCookie(
        SESSION_COOKIE_NAME,
        session.token,
        sessionCookieOptions(session.expiresAt),
      );

      return {
        data: {
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
          },
          csrfToken: session.csrfToken,
        },
      };
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const authContext = requireAuthContext(request);
    await revokeSession(authContext.sessionId);
    reply.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
    return reply.status(204).send();
  });

  app.get(
    "/me",
    { schema: { response: { 200: meResponseSchema } } },
    async (request) => {
      const authContext = requireAuthContext(request);
      return {
        data: {
          user: authContext.user,
          memberships: authContext.memberships,
        },
      };
    },
  );

  app.get(
    "/auth/csrf",
    { schema: { response: { 200: csrfResponseSchema } } },
    async (request) => {
      const authContext = requireAuthContext(request);
      const csrfToken = await rotateCsrfToken(authContext.sessionId);
      return { data: { csrfToken } };
    },
  );
};
