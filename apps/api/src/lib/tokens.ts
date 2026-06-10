import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// 256 bits of randomness, base64url encoded.
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatchesDigest(token: string, digest: string): boolean {
  const candidate = Buffer.from(digestToken(token), "hex");
  const expected = Buffer.from(digest, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

// Keyed so raw IP addresses are never stored and cannot be brute-forced
// from audit or session records without the server secret.
export function hashIpAddress(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}
