import { PrismaClient } from "@prisma/client";

export { Prisma } from "@prisma/client";
export type {
  CaseRole,
  HandlingLevel,
  OrganizationRole,
  Session,
  User,
} from "@prisma/client";

const globalDatabase = globalThis as unknown as {
  database?: PrismaClient;
};

export const database =
  globalDatabase.database ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalDatabase.database = database;
}

