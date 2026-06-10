import { describe, expect, it } from "vitest";
import {
  canInCase,
  canInOrganization,
  type CaseAction,
  type OrganizationAction,
} from "../../src/authorization/policy.js";

describe("organization role matrix", () => {
  const matrix: Array<{
    role: "OWNER" | "ADMIN" | "MEMBER" | undefined;
    action: OrganizationAction;
    allowed: boolean;
  }> = [
    { role: "OWNER", action: "organization.members.read", allowed: true },
    { role: "OWNER", action: "organization.members.manage", allowed: true },
    { role: "OWNER", action: "case.create", allowed: true },
    { role: "ADMIN", action: "organization.members.read", allowed: true },
    { role: "ADMIN", action: "organization.members.manage", allowed: true },
    { role: "ADMIN", action: "case.create", allowed: true },
    { role: "MEMBER", action: "organization.members.read", allowed: true },
    { role: "MEMBER", action: "organization.members.manage", allowed: false },
    { role: "MEMBER", action: "case.create", allowed: true },
    { role: undefined, action: "organization.members.read", allowed: false },
    { role: undefined, action: "organization.members.manage", allowed: false },
    { role: undefined, action: "case.create", allowed: false },
  ];

  it.each(matrix)("$role / $action -> $allowed", ({ role, action, allowed }) => {
    expect(canInOrganization({ organizationRole: role }, action)).toBe(allowed);
  });
});

describe("case role matrix", () => {
  const allCaseActions: CaseAction[] = [
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

  const allowedByRole: Record<string, CaseAction[]> = {
    OWNER: allCaseActions,
    ANALYST: [
      "case.read",
      "case.update",
      "evidence.create",
      "evidence.read",
      "evidence.download",
      "connector.run",
      "connector.retry",
    ],
    REVIEWER: ["case.read", "evidence.read", "evidence.download", "audit.read"],
    VIEWER: ["case.read", "evidence.read"],
  };

  for (const [role, allowed] of Object.entries(allowedByRole)) {
    for (const action of allCaseActions) {
      it(`case ${role} / ${action} -> ${allowed.includes(action)}`, () => {
        expect(
          canInCase(
            {
              organizationRole: "MEMBER",
              caseRole: role as "OWNER" | "ANALYST" | "REVIEWER" | "VIEWER",
              handlingLevel: "INTERNAL",
            },
            action,
          ),
        ).toBe(allowed.includes(action));
      });
    }
  }

  it("denies everything without an organization membership", () => {
    for (const action of allCaseActions) {
      expect(
        canInCase(
          {
            organizationRole: undefined,
            caseRole: "OWNER",
            handlingLevel: "INTERNAL",
          },
          action,
        ),
      ).toBe(false);
    }
  });

  it("grants org admins read oversight of non-restricted cases", () => {
    const context = {
      organizationRole: "ADMIN" as const,
      caseRole: undefined,
      handlingLevel: "INTERNAL" as const,
    };
    expect(canInCase(context, "case.read")).toBe(true);
    expect(canInCase(context, "audit.read")).toBe(true);
    expect(canInCase(context, "case.update")).toBe(false);
    expect(canInCase(context, "evidence.read")).toBe(false);
  });

  it("denies org admins oversight of RESTRICTED cases", () => {
    const context = {
      organizationRole: "ADMIN" as const,
      caseRole: undefined,
      handlingLevel: "RESTRICTED" as const,
    };
    expect(canInCase(context, "case.read")).toBe(false);
    expect(canInCase(context, "audit.read")).toBe(false);
  });

  it("denies org members without case membership", () => {
    const context = {
      organizationRole: "MEMBER" as const,
      caseRole: undefined,
      handlingLevel: "INTERNAL" as const,
    };
    for (const action of allCaseActions) {
      expect(canInCase(context, action)).toBe(false);
    }
  });
});
