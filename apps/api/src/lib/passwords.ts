import argon2 from "argon2";

// Versioned so future parameter upgrades can detect and rehash old hashes.
// Version 1 follows the OWASP Argon2id minimum recommendation.
const PASSWORD_HASH_VERSIONS = {
  1: {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  },
} as const;

export const CURRENT_PASSWORD_HASH_VERSION = 1;

const currentParameters =
  PASSWORD_HASH_VERSIONS[CURRENT_PASSWORD_HASH_VERSION];

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, currentParameters);
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, currentParameters);
}

// Verified against when no user matches, so the response time of a login
// attempt does not reveal whether the account exists.
export const DUMMY_PASSWORD_HASH_PROMISE = hashPassword(
  "dummy-password-for-timing-equalization",
);
