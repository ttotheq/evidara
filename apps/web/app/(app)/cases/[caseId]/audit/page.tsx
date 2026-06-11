"use client";

import type {
  AuditEventListResponse,
  AuditEventView,
} from "@evidara/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../../../../lib/api";
import { useCase } from "../case-context";

const ACTION_LABELS: Record<AuditEventView["action"], string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "authorization.denied": "Action denied",
  "case.created": "Case created",
  "case.updated": "Case updated",
  "evidence.created": "Evidence added",
  "evidence.updated": "Evidence updated",
  "evidence.downloaded": "Evidence downloaded",
  "connector_job.queued": "Collection queued",
  "connector_job.retried": "Collection retried",
  "connector_job.succeeded": "Collection succeeded",
  "connector_job.failed": "Collection failed",
};

const OUTCOME_LABELS: Record<AuditEventView["outcome"], string> = {
  success: "Success",
  failure: "Failure",
  denied: "Denied",
};

// One short, human-readable line from the allowlisted metadata.
function describeEvent(event: AuditEventView): string | null {
  const metadata = event.metadata;
  const parts: string[] = [];
  if (typeof metadata.attemptedAction === "string") {
    parts.push(`attempted ${metadata.attemptedAction}`);
  }
  if (typeof metadata.connectorKey === "string") {
    parts.push(metadata.connectorKey);
  }
  if (typeof metadata.targetSummary === "string") {
    parts.push(metadata.targetSummary);
  }
  if (typeof metadata.filename === "string") {
    parts.push(metadata.filename);
  }
  if (typeof metadata.kind === "string") {
    parts.push(metadata.kind.toLowerCase());
  }
  if (typeof metadata.errorCode === "string") {
    parts.push(metadata.errorCode);
  }
  if (typeof metadata.reason === "string") {
    parts.push(metadata.reason.replaceAll("_", " "));
  }
  if (Array.isArray(metadata.changedFields)) {
    parts.push(`changed ${metadata.changedFields.join(", ")}`);
  }
  if (typeof metadata.sha256 === "string") {
    parts.push(`sha256 ${metadata.sha256.slice(0, 12)}…`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function CaseAuditPage() {
  const { detail, can } = useCase();
  const caseId = detail.case.id;
  const canRead = can("audit.read");

  const [result, setResult] = useState<{
    state: "loading" | "error" | "ready";
    events: AuditEventView[];
    nextCursor?: string;
  }>({ state: "loading", events: [] });
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setResult((previous) => ({ ...previous, state: "loading" }));
    try {
      const response = await apiFetch<AuditEventListResponse>(
        `/v1/cases/${caseId}/audit-events?limit=50`,
      );
      setResult({
        state: "ready",
        events: response.data,
        ...(response.nextCursor ? { nextCursor: response.nextCursor } : {}),
      });
    } catch {
      setResult({ state: "error", events: [] });
    }
  }, [caseId]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  async function loadMore() {
    if (!result.nextCursor) return;
    setLoadingMore(true);
    try {
      const response = await apiFetch<AuditEventListResponse>(
        `/v1/cases/${caseId}/audit-events?limit=50&cursor=${result.nextCursor}`,
      );
      setResult((previous) => ({
        state: "ready",
        events: [...previous.events, ...response.data],
        ...(response.nextCursor ? { nextCursor: response.nextCursor } : {}),
      }));
    } catch {
      // Keep the current page; the retry affordance is the button itself.
    } finally {
      setLoadingMore(false);
    }
  }

  if (!canRead) {
    return (
      <main className="page">
        <div className="emptyState">
          <h2>Audit access required</h2>
          <p>
            Your role cannot read the audit log of this case. Case owners and
            reviewers can.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Audit timeline</p>
          <p className="pageLede">
            Append-only record of every mutation, download, collection run, and
            denied attempt in this case.
          </p>
        </div>
      </div>

      {result.state === "loading" ? (
        <p className="stateNote" aria-live="polite">
          Loading audit events…
        </p>
      ) : result.state === "error" ? (
        <div className="stateNote" role="alert">
          <p>The audit timeline could not be loaded.</p>
          <button
            type="button"
            className="buttonSecondary"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : result.events.length === 0 ? (
        <div className="emptyState">
          <h2>No audit events yet</h2>
          <p>Events appear as soon as this case is worked on.</p>
        </div>
      ) : (
        <>
          <ol className="auditTimeline">
            {result.events.map((event) => {
              const description = describeEvent(event);
              return (
                <li key={event.id} className="auditEvent">
                  <div className="auditEventHead">
                    <strong>
                      {ACTION_LABELS[event.action] ?? event.action}
                    </strong>
                    <span className={`pill auditOutcome-${event.outcome}`}>
                      {OUTCOME_LABELS[event.outcome]}
                    </span>
                  </div>
                  <p className="auditEventMeta">
                    {event.actor?.displayName ?? "System"} ·{" "}
                    <time dateTime={event.createdAt}>
                      {new Date(event.createdAt).toLocaleString()}
                    </time>{" "}
                    · {event.resourceType}
                    {description ? (
                      <span className="cellSub">{description}</span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ol>
          {result.nextCursor ? (
            <div className="loadMoreRow">
              <button
                type="button"
                className="buttonSecondary"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
