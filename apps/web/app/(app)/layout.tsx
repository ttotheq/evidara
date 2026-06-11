"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { AuthProvider, useAuth } from "../../lib/auth";

function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (auth.status === "unauthenticated") {
      router.replace("/login");
    }
  }, [auth.status, router]);

  if (auth.status === "loading") {
    return (
      <main className="appLoading" aria-live="polite">
        <p>Loading your workspace…</p>
      </main>
    );
  }

  if (auth.status === "unauthenticated" || !auth.user) {
    return null;
  }

  async function handleSignOut() {
    await auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="appFrame">
      <header className="topbar">
        <div className="topbarLeft">
          <a className="brand" href="/cases">
            <span className="brandMark">E</span>
            Evidara
          </a>
          {auth.memberships.length > 1 ? (
            <>
              <label className="srOnly" htmlFor="organization-switcher">
                Active organization
              </label>
              <select
                id="organization-switcher"
                className="orgSwitcher"
                value={auth.activeOrganization?.organizationId ?? ""}
                onChange={(event) =>
                  auth.setActiveOrganizationId(event.target.value)
                }
              >
                {auth.memberships.map((membership) => (
                  <option
                    key={membership.organizationId}
                    value={membership.organizationId}
                  >
                    {membership.organizationName}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span className="pill">
              {auth.activeOrganization?.organizationName ?? "No organization"}
            </span>
          )}
        </div>
        <div className="topbarRight">
          <span className="userName">{auth.user.displayName}</span>
          <button
            type="button"
            className="buttonSecondary"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="appBody">{children}</div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
