import { buildApp } from "../src/app.js";
import type { CaseRole, HandlingLevel, OrganizationRole } from "@evidara/database";
import { database } from "@evidara/database";
import { hashPassword } from "../src/lib/passwords.js";

type App = Awaited<ReturnType<typeof buildApp>>;

export const TEST_PASSWORD = "correct-horse-battery-staple";

export async function resetDatabase() {
  const tables = await database.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  await database.$executeRawUnsafe(
    `TRUNCATE TABLE ${tables.map((table) => `"${table.tablename}"`).join(", ")} CASCADE`,
  );
}

export async function createUser(
  email: string,
  options: { disabled?: boolean; password?: string } = {},
) {
  return database.user.create({
    data: {
      email,
      displayName: email.split("@")[0] ?? email,
      passwordHash: await hashPassword(options.password ?? TEST_PASSWORD),
      disabledAt: options.disabled ? new Date() : null,
    },
  });
}

export async function createOrganization(slug: string) {
  return database.organization.create({
    data: { name: slug, slug },
  });
}

export async function addMember(
  organizationId: string,
  userId: string,
  role: OrganizationRole,
) {
  return database.organizationMember.create({
    data: { organizationId, userId, role },
  });
}

export async function createCaseFixture(input: {
  organizationId: string;
  createdById: string;
  name?: string;
  handlingLevel?: HandlingLevel;
  memberRole?: CaseRole;
}) {
  return database.case.create({
    data: {
      organizationId: input.organizationId,
      createdById: input.createdById,
      name: input.name ?? "Fixture case",
      objective: "Objective text for fixture case.",
      scope: "Scope text for fixture case.",
      justification: "Justification text for fixture case.",
      handlingLevel: input.handlingLevel ?? "INTERNAL",
      members: {
        create: {
          userId: input.createdById,
          role: input.memberRole ?? "OWNER",
        },
      },
    },
  });
}

export async function addCaseMember(
  caseId: string,
  userId: string,
  role: CaseRole,
) {
  return database.caseMember.create({ data: { caseId, userId, role } });
}

export async function login(app: App, email: string, password = TEST_PASSWORD) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`login failed with status ${response.statusCode}`);
  }
  const sessionCookie = response.cookies.find(
    (candidate) => candidate.name === "evidara_session",
  );
  if (!sessionCookie) {
    throw new Error("login response did not set a session cookie");
  }
  const body = response.json() as { data: { csrfToken: string } };
  return {
    cookie: { evidara_session: sessionCookie.value },
    csrfToken: body.data.csrfToken,
  };
}
