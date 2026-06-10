import { database } from "@evidara/database";
import { config } from "../../config.js";
import { digestToken, generateToken } from "../../lib/tokens.js";

const LAST_SEEN_UPDATE_INTERVAL_MS = 60_000;

export interface IssuedSession {
  sessionId: string;
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

export async function createSession(input: {
  userId: string;
  ipHash?: string | undefined;
  userAgent?: string | undefined;
}): Promise<IssuedSession> {
  const token = generateToken();
  const csrfToken = generateToken();
  const expiresAt = new Date(
    Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000,
  );

  const session = await database.session.create({
    data: {
      userId: input.userId,
      tokenDigest: digestToken(token),
      csrfDigest: digestToken(csrfToken),
      expiresAt,
      ipHash: input.ipHash ?? null,
      userAgent: input.userAgent?.slice(0, 255) ?? null,
    },
  });

  return { sessionId: session.id, token, csrfToken, expiresAt };
}

export async function findActiveSession(token: string) {
  const session = await database.session.findUnique({
    where: { tokenDigest: digestToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: {
              organization: { select: { id: true, slug: true, name: true } },
            },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt <= new Date()) return null;
  if (session.user.disabledAt) return null;

  if (
    Date.now() - session.lastSeenAt.getTime() >
    LAST_SEEN_UPDATE_INTERVAL_MS
  ) {
    await database.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  return session;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await database.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function rotateCsrfToken(sessionId: string): Promise<string> {
  const csrfToken = generateToken();
  await database.session.update({
    where: { id: sessionId },
    data: { csrfDigest: digestToken(csrfToken) },
  });
  return csrfToken;
}
