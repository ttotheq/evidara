import cookie from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { config } from "../config.js";
import { tokenMatchesDigest } from "../lib/tokens.js";
import { findActiveSession } from "../modules/auth/sessions.js";

export const SESSION_COOKIE_NAME = "evidara_session";
export const CSRF_HEADER_NAME = "x-csrf-token";
export const SESSION_COOKIE_PATH = "/v1";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface AuthContext {
  user: { id: string; email: string; displayName: string };
  sessionId: string;
  csrfDigest: string;
  memberships: Array<{
    organizationId: string;
    organizationSlug: string;
    organizationName: string;
    role: "OWNER" | "ADMIN" | "MEMBER";
  }>;
}

declare module "fastify" {
  interface FastifyRequest {
    authContext: AuthContext | null;
  }
  interface FastifyContextConfig {
    public?: boolean;
  }
}

export function sessionCookieOptions(expiresAt?: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.NODE_ENV === "production",
    path: SESSION_COOKIE_PATH,
    ...(expiresAt ? { expires: expiresAt } : {}),
  };
}

export function requireAuthContext(request: FastifyRequest): AuthContext {
  if (!request.authContext) {
    throw Object.assign(new Error("Authentication required."), {
      statusCode: 401,
      code: "UNAUTHENTICATED",
    });
  }
  return request.authContext;
}

export function organizationRoleFor(
  authContext: AuthContext,
  organizationId: string,
) {
  return authContext.memberships.find(
    (membership) => membership.organizationId === organizationId,
  )?.role;
}

function sendUnauthenticated(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
  return reply.status(401).send({
    error: {
      code: "UNAUTHENTICATED",
      message: "Authentication required.",
    },
  });
}

function isPublicRoute(request: FastifyRequest): boolean {
  if (request.routeOptions.config?.public) return true;
  // Swagger UI registers its own asset routes under /docs.
  return request.url === "/docs" || request.url.startsWith("/docs/");
}

export const authenticationPlugin = fp(async (app) => {
  await app.register(cookie);

  app.decorateRequest("authContext", null);

  app.addHook("onRequest", async (request, reply) => {
    if (STATE_CHANGING_METHODS.has(request.method)) {
      const origin = request.headers.origin;
      if (origin && origin !== config.WEB_URL) {
        return reply.status(403).send({
          error: {
            code: "FORBIDDEN_ORIGIN",
            message: "Request origin is not allowed.",
          },
        });
      }
    }

    if (isPublicRoute(request)) return;

    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) {
      return sendUnauthenticated(reply);
    }

    const session = await findActiveSession(token);
    if (!session) {
      return sendUnauthenticated(reply);
    }

    request.authContext = {
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
      },
      sessionId: session.id,
      csrfDigest: session.csrfDigest,
      memberships: session.user.memberships.map((membership) => ({
        organizationId: membership.organization.id,
        organizationSlug: membership.organization.slug,
        organizationName: membership.organization.name,
        role: membership.role,
      })),
    };

    if (STATE_CHANGING_METHODS.has(request.method)) {
      const csrfToken = request.headers[CSRF_HEADER_NAME];
      if (
        typeof csrfToken !== "string" ||
        !tokenMatchesDigest(csrfToken, session.csrfDigest)
      ) {
        return reply.status(403).send({
          error: {
            code: "CSRF_REJECTED",
            message: "Missing or invalid CSRF token.",
          },
        });
      }
    }
  });
});
