import { describe, expect, it } from "vitest";
import {
  hashPassword,
  passwordNeedsRehash,
  verifyPassword,
} from "../../src/lib/passwords.js";
import {
  digestToken,
  generateToken,
  hashIpAddress,
  tokenMatchesDigest,
} from "../../src/lib/tokens.js";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("a-test-password");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "a-test-password")).toBe(true);
    expect(await verifyPassword(hash, "a-wrong-password")).toBe(false);
  });

  it("does not flag freshly hashed passwords for rehash", async () => {
    const hash = await hashPassword("a-test-password");
    expect(passwordNeedsRehash(hash)).toBe(false);
  });

  it("rejects malformed hashes without throwing", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });
});

describe("session tokens", () => {
  it("generates 256-bit unique tokens", () => {
    const token = generateToken();
    expect(Buffer.from(token, "base64url").length).toBe(32);
    expect(generateToken()).not.toBe(token);
  });

  it("matches tokens against stored digests", () => {
    const token = generateToken();
    const digest = digestToken(token);
    expect(tokenMatchesDigest(token, digest)).toBe(true);
    expect(tokenMatchesDigest(generateToken(), digest)).toBe(false);
    expect(tokenMatchesDigest(token, "deadbeef")).toBe(false);
  });

  it("hashes IP addresses with the server secret", () => {
    const first = hashIpAddress("203.0.113.10", "secret-a");
    expect(first).toBe(hashIpAddress("203.0.113.10", "secret-a"));
    expect(first).not.toBe(hashIpAddress("203.0.113.10", "secret-b"));
    expect(first).not.toContain("203");
  });
});
