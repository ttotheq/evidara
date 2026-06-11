"use client";

import type { Case } from "@evidara/contracts";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

interface CaseListResponse {
  data: Case[];
  nextCursor?: string;
}

const HANDLING_LABELS: Record<string, string> = {
  PUBLIC: "Public",
  INTERNAL: "Internal",
  SENSITIVE: "Sensitive",
  RESTRICTED: "Restricted",
};

function CaseListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";

  const [search, setSearch] = useState(q);
  const [result, setResult] = useState<{
    state: "loading" | "error" | "ready";
    cases: Case[];
  }>({ state: "loading", cases: [] });

  useEffect(() => {
    let cancelled = false;
    setResult((previous) => ({ ...previous, state: "loading" }));
    const query = new URLSearchParams({ limit: "50" });
    if (q) query.set("q", q);
    if (status) query.set("status", status);
    apiFetch<CaseListResponse>(`/v1/cases?${query.toString()}`)
      .then((response) => {
        if (!cancelled) setResult({ state: "ready", cases: response.data });
      })
      .catch(() => {
        if (!cancelled) setResult({ state: "error", cases: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [q, status]);

  function applyFilters(nextQ: string, nextStatus: string) {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextStatus) params.set("status", nextStatus);
    router.replace(`/cases?${params.toString()}`);
  }

  return (
    <main className="page">
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Cases</p>
          <h1 className="pageTitle">Investigations</h1>
        </div>
        <Link className="buttonPrimary" href="/cases/new">
          New case
        </Link>
      </div>

      <form
        className="filterBar"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters(search.trim(), status);
        }}
      >
        <label className="srOnly" htmlFor="case-search">
          Search cases by name
        </label>
        <input
          id="case-search"
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="srOnly" htmlFor="case-status">
          Filter by status
        </label>
        <select
          id="case-status"
          value={status}
          onChange={(event) => applyFilters(search.trim(), event.target.value)}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <button type="submit" className="buttonSecondary">
          Search
        </button>
      </form>

      {result.state === "loading" ? (
        <p className="stateNote" aria-live="polite">
          Loading cases…
        </p>
      ) : result.state === "error" ? (
        <div className="stateNote" role="alert">
          <p>The case list could not be loaded.</p>
          <button
            type="button"
            className="buttonSecondary"
            onClick={() => applyFilters(q, status)}
          >
            Retry
          </button>
        </div>
      ) : result.cases.length === 0 ? (
        <div className="emptyState">
          <h2>{q || status ? "No matching cases" : "No cases yet"}</h2>
          <p>
            {q || status
              ? "Adjust the search or status filter to find the case you need."
              : "Create your first case to define an objective, scope, and collection boundaries before gathering evidence."}
          </p>
          {!q && !status ? (
            <Link className="buttonPrimary" href="/cases/new">
              Create a case
            </Link>
          ) : null}
        </div>
      ) : (
        <table className="dataTable">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Status</th>
              <th scope="col">Handling</th>
              <th scope="col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {result.cases.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link className="rowLink" href={`/cases/${item.id}/overview`}>
                    {item.name}
                  </Link>
                </td>
                <td>
                  <span className="pill">
                    {item.status === "ACTIVE" ? "Active" : "Archived"}
                  </span>
                </td>
                <td>
                  <span
                    className={`pill handling-${item.handlingLevel.toLowerCase()}`}
                  >
                    {HANDLING_LABELS[item.handlingLevel] ?? item.handlingLevel}
                  </span>
                </td>
                <td>{new Date(item.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

export default function CasesPage() {
  return (
    <Suspense fallback={<p className="stateNote">Loading cases…</p>}>
      <CaseListPage />
    </Suspense>
  );
}
