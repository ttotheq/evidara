"use client";

import type { CaseDetail } from "@evidara/contracts";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../../../../lib/api";
import { CaseContext } from "./case-context";

const HANDLING_BANNERS: Record<string, string> = {
  PUBLIC: "Public — findings may be released outside the organization.",
  INTERNAL: "Internal — share within the organization only.",
  SENSITIVE: "Sensitive — share only with people who need to know.",
  RESTRICTED: "Restricted — visible to explicit case members only.",
};

const TABS = [
  ["overview", "Overview"],
  ["sources", "Sources"],
  ["jobs", "Jobs"],
  ["audit", "Audit"],
  ["settings", "Settings"],
] as const;

export default function CaseLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ caseId: string }>();
  const pathname = usePathname();
  const caseId = params.caseId;

  const [state, setState] = useState<{
    status: "loading" | "ready" | "not_found" | "error";
    detail: CaseDetail | null;
  }>({ status: "loading", detail: null });

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<{ data: CaseDetail }>(
        `/v1/cases/${caseId}`,
      );
      setState({ status: "ready", detail: response.data });
    } catch (caught) {
      setState({
        status:
          caught instanceof ApiError && caught.status === 404
            ? "not_found"
            : "error",
        detail: null,
      });
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "loading") {
    return (
      <main className="page" aria-live="polite">
        <p className="stateNote">Loading case…</p>
      </main>
    );
  }

  if (state.status === "not_found") {
    return (
      <main className="page">
        <div className="emptyState">
          <h1>Case unavailable</h1>
          <p>
            This case does not exist or you do not have access to it. Ask a case
            owner to add you if you expected access.
          </p>
          <Link className="buttonSecondary" href="/cases">
            Back to cases
          </Link>
        </div>
      </main>
    );
  }

  if (state.status === "error" || !state.detail) {
    return (
      <main className="page">
        <div className="stateNote" role="alert">
          <p>The case could not be loaded.</p>
          <button
            type="button"
            className="buttonSecondary"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const detail = state.detail;
  const canUpdate = detail.permissions.includes("case.update");

  return (
    <CaseContext.Provider
      value={{
        detail,
        refresh: load,
        can: (action) => detail.permissions.includes(action),
      }}
    >
      <div className="caseFrame">
        <div
          className={`handlingBanner handling-${detail.case.handlingLevel.toLowerCase()}`}
          role="note"
        >
          <strong>{detail.case.handlingLevel}</strong>{" "}
          {HANDLING_BANNERS[detail.case.handlingLevel]}
        </div>

        <header className="caseHeaderBar">
          <div>
            <p className="eyebrow">
              <Link href="/cases">Cases</Link> /{" "}
              {detail.case.status === "ARCHIVED" ? "Archived case" : "Case"}
            </p>
            <h1 className="pageTitle">{detail.case.name}</h1>
          </div>
          {!canUpdate ? (
            <span className="pill" title="Your role cannot modify this case">
              View-only access
            </span>
          ) : null}
        </header>

        <nav className="caseTabs" aria-label="Case sections">
          {TABS.map(([segment, label]) => {
            const href = `/cases/${caseId}/${segment}` as const;
            const active = pathname === href;
            return (
              <Link
                key={segment}
                href={href}
                aria-current={active ? "page" : undefined}
                className={active ? "caseTab caseTabActive" : "caseTab"}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </CaseContext.Provider>
  );
}
