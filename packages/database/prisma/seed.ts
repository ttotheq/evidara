import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { z } from "zod";

// Values already present in the process environment take precedence over the file.
function loadEnvironmentFile() {
  const fileName = process.env.NODE_ENV === "test" ? ".env.test" : ".env";
  let directory = process.cwd();
  for (;;) {
    const candidate = join(directory, fileName);
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
    const parent = dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

loadEnvironmentFile();

const seedSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SEED_OWNER_EMAIL: z.string().email(),
  SEED_OWNER_PASSWORD: z.string().min(12),
  SEED_OWNER_NAME: z.string().min(1),
  SEED_ORGANIZATION_NAME: z.string().min(1),
  SEED_ORGANIZATION_SLUG: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "lowercase letters, digits, and hyphens"),
});

const parsed = seedSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid seed configuration:\n${issues}`);
  process.exit(1);
}

const seedConfig = parsed.data;

if (seedConfig.NODE_ENV === "production") {
  console.error("Seeding is a development and test convenience; refusing to run in production.");
  process.exit(1);
}

const database = new PrismaClient();

const passwordHash = await argon2.hash(seedConfig.SEED_OWNER_PASSWORD, {
  type: argon2.argon2id,
});

const organization = await database.organization.upsert({
  where: { slug: seedConfig.SEED_ORGANIZATION_SLUG },
  create: {
    name: seedConfig.SEED_ORGANIZATION_NAME,
    slug: seedConfig.SEED_ORGANIZATION_SLUG,
  },
  update: {
    name: seedConfig.SEED_ORGANIZATION_NAME,
  },
});

const owner = await database.user.upsert({
  where: { email: seedConfig.SEED_OWNER_EMAIL },
  create: {
    email: seedConfig.SEED_OWNER_EMAIL,
    displayName: seedConfig.SEED_OWNER_NAME,
    passwordHash,
  },
  update: {
    displayName: seedConfig.SEED_OWNER_NAME,
    passwordHash,
    disabledAt: null,
  },
});

await database.organizationMember.upsert({
  where: {
    organizationId_userId: {
      organizationId: organization.id,
      userId: owner.id,
    },
  },
  create: {
    organizationId: organization.id,
    userId: owner.id,
    role: "OWNER",
  },
  update: {
    role: "OWNER",
  },
});

await database.$disconnect();

console.log(
  `Seeded organization "${organization.slug}" with owner ${owner.email}.`,
);
