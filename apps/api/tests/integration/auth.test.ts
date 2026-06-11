import { database } from "@evidara/database";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import {
  addMember,
  createOrganization,
  createUser,
  login,
  resetDatabase,
  TEST_PASSWORD,
} from "../helpers.js";

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
});

describe("login", () => {
  it("sets an HttpOnly session cookie and returns the user and CSRF token", async () => {
    const user = await createUser("analyst@example.test");
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "analyst@example.test", password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.user).toEqual({
      id: user.id,
      email: "analyst@example.test",
      displayName: "analyst",
    });
    expect(body.data.csrfToken).toMatch(/^[\w-]{43}$/);

    const cookie = response.cookies.find((c) => c.name === "evidara_session");
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/v1");
  });

  it("returns the same generic 401 for wrong password and unknown email", async () => {
    await createUser("analyst@example.test");

    const wrongPassword = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "analyst@example.test", password: "wrong-password" },
    });
    const unknownEmail = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "nobody@example.test", password: "wrong-password" },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });

  it("rejects disabled users with the same generic message", async () => {
    await createUser("disabled@example.test", { disabled: true });
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { email: "disabled@example.test", password: TEST_PASSWORD },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects cross-origin login attempts", async () => {
    await createUser("analyst@example.test");
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { origin: "https://evil.example" },
      payload: { email: "analyst@example.test", password: TEST_PASSWORD },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN_ORIGIN");
  });
});

describe("session lifecycle", () => {
  it("serves /v1/me for an authenticated user with memberships", async () => {
    const user = await createUser("analyst@example.test");
    const organization = await createOrganization("acme");
    await addMember(organization.id, user.id, "ADMIN");

    const session = await login(app, "analyst@example.test");
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: session.cookie,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.memberships).toEqual([
      {
        organizationId: organization.id,
        organizationSlug: "acme",
        organizationName: "acme",
        role: "ADMIN",
      },
    ]);
  });

  it("rejects requests without a session cookie", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/me" });
    expect(response.statusCode).toBe(401);
  });

  it("rejects garbage session tokens", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: { evidara_session: "forged-token" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects revoked sessions after logout", async () => {
    await createUser("analyst@example.test");
    const session = await login(app, "analyst@example.test");

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      cookies: session.cookie,
      headers: { "x-csrf-token": session.csrfToken },
    });
    expect(logout.statusCode).toBe(204);

    const after = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: session.cookie,
    });
    expect(after.statusCode).toBe(401);
  });

  it("rejects expired sessions", async () => {
    const user = await createUser("analyst@example.test");
    const session = await login(app, "analyst@example.test");

    await database.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: session.cookie,
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects sessions of users disabled after sign-in", async () => {
    const user = await createUser("analyst@example.test");
    const session = await login(app, "analyst@example.test");

    await database.user.update({
      where: { id: user.id },
      data: { disabledAt: new Date() },
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      cookies: session.cookie,
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("CSRF protection", () => {
  it("rejects state-changing requests without a CSRF token", async () => {
    await createUser("analyst@example.test");
    const session = await login(app, "analyst@example.test");

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      cookies: session.cookie,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("CSRF_REJECTED");
  });

  it("rejects state-changing requests with a wrong CSRF token", async () => {
    await createUser("analyst@example.test");
    const session = await login(app, "analyst@example.test");

    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      cookies: session.cookie,
      headers: { "x-csrf-token": "0".repeat(43) },
    });
    expect(response.statusCode).toBe(403);
  });

  it("rotates the CSRF token via /v1/auth/csrf and invalidates the old one", async () => {
    await createUser("analyst@example.test");
    const session = await login(app, "analyst@example.test");

    const rotation = await app.inject({
      method: "GET",
      url: "/v1/auth/csrf",
      cookies: session.cookie,
    });
    expect(rotation.statusCode).toBe(200);
    const newToken = rotation.json().data.csrfToken;
    expect(newToken).not.toBe(session.csrfToken);

    const withOldToken = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      cookies: session.cookie,
      headers: { "x-csrf-token": session.csrfToken },
    });
    expect(withOldToken.statusCode).toBe(403);

    const withNewToken = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      cookies: session.cookie,
      headers: { "x-csrf-token": newToken },
    });
    expect(withNewToken.statusCode).toBe(204);
  });
});
