import type { CaseRole, HandlingLevel, OrganizationRole } from "@evidara/database";

export type OrganizationAction =
  | "organization.members.read"
  | "organization.members.manage"
  | "case.create";

export type CaseAction =
  | "case.read"
  | "case.update"
  | "case.members.manage"
  | "evidence.create"
  | "evidence.read"
  | "evidence.download"
  | "connector.run"
  | "connector.retry"
  | "audit.read";

export const ALL_CASE_ACTIONS: readonly CaseAction[] = [
  "case.read",
  "case.update",
  "case.members.manage",
  "evidence.create",
  "evidence.read",
  "evidence.download",
  "connector.run",
  "connector.retry",
  "audit.read",
];

const ORGANIZATION_ROLE_ACTIONS: Record<
  OrganizationRole,
  ReadonlySet<OrganizationAction>
> = {
  OWNER: new Set([
    "organization.members.read",
    "organization.members.manage",
    "case.create",
  ]),
  ADMIN: new Set([
    "organization.members.read",
    "organization.members.manage",
    "case.create",
  ]),
  MEMBER: new Set(["organization.members.read", "case.create"]),
};

const CASE_ROLE_ACTIONS: Record<CaseRole, ReadonlySet<CaseAction>> = {
  OWNER: new Set([
    "case.read",
    "case.update",
    "case.members.manage",
    "evidence.create",
    "evidence.read",
    "evidence.download",
    "connector.run",
    "connector.retry",
    "audit.read",
  ]),
  ANALYST: new Set([
    "case.read",
    "case.update",
    "evidence.create",
    "evidence.read",
    "evidence.download",
    "connector.run",
    "connector.retry",
  ]),
  REVIEWER: new Set([
    "case.read",
    "evidence.read",
    "evidence.download",
    "audit.read",
  ]),
  VIEWER: new Set(["case.read", "evidence.read"]),
};

// Organization owners and admins get read-level oversight of cases they are
// not members of, except RESTRICTED cases, which require explicit membership.
const ORGANIZATION_OVERSIGHT_ACTIONS: ReadonlySet<CaseAction> = new Set([
  "case.read",
  "audit.read",
]);

export interface OrganizationContext {
  organizationRole: OrganizationRole | undefined;
}

export interface CaseContext extends OrganizationContext {
  caseRole: CaseRole | undefined;
  handlingLevel: HandlingLevel;
}

export function canInOrganization(
  context: OrganizationContext,
  action: OrganizationAction,
): boolean {
  if (!context.organizationRole) return false;
  return ORGANIZATION_ROLE_ACTIONS[context.organizationRole].has(action);
}

export function canInCase(context: CaseContext, action: CaseAction): boolean {
  if (!context.organizationRole) return false;

  if (context.caseRole && CASE_ROLE_ACTIONS[context.caseRole].has(action)) {
    return true;
  }

  if (
    (context.organizationRole === "OWNER" ||
      context.organizationRole === "ADMIN") &&
    context.handlingLevel !== "RESTRICTED" &&
    ORGANIZATION_OVERSIGHT_ACTIONS.has(action)
  ) {
    return true;
  }

  return false;
}
