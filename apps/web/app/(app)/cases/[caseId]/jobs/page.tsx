"use client";

import type {
  ConnectorJobListResponse,
  ConnectorJobView,
} from "@evidara/contracts";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ApiError, apiFetch } from "../../../../../lib/api";
import { useCase } from "../case-context";

const STATUS_LABELS: Record<ConnectorJobView["status"], string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

const ACTIVE_STATUSES = new Set<ConnectorJobView["status"]>([
  "QUEUED",
  "RUNNING",
]);

const POLL_INTERVAL_MS = 4000;

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modalHeader">
        <h2>{title}</h2>
        <button type="button" className="modalClose" onClick={onClose}>
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}

function CaptureDialog({
  caseId,
  onClose,
  onQueued,
}: {
  caseId: string;
  onClose: () => void;
  onQueued: () => void;
}) {
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [url, setUrl] = useState("");
  const [analystNotes, setAnalystNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/v1/cases/${caseId}/connector-jobs`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: {
          connectorKey: "web-page-capture",
          target: { url: url.trim() },
          ...(analystNotes.trim() ? { analystNotes: analystNotes.trim() } : {}),
        },
      });
      onQueued();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The capture could not be queued. Try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Queue web page capture" onClose={onClose}>
      <form onSubmit={(event) => void handleSubmit(event)} className="stackedForm">
        <p className="fieldHint">
          The capture worker fetches a single public page over http(s) and
          stores the raw response with its SHA-256 hash and full provenance.
          For safety it refuses internal, private, loopback, link-local, and
          cloud-metadata addresses, re-checks every redirect, applies size and
          time limits, and never executes page JavaScript.
        </p>
        <label htmlFor="capture-url">Page URL</label>
        <input
          id="capture-url"
          type="url"
          required
          placeholder="https://example.com/article"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <label htmlFor="capture-notes">Analyst notes (optional)</label>
        <textarea
          id="capture-notes"
          rows={3}
          maxLength={5000}
          placeholder="Why this page matters to the case…"
          value={analystNotes}
          onChange={(event) => setAnalystNotes(event.target.value)}
        />
        {error ? (
          <p className="formError" role="alert">
            {error}
          </p>
        ) : null}
        <div className="formActions">
          <button type="submit" className="buttonPrimary" disabled={submitting}>
            {submitting ? "Queueing…" : "Queue capture"}
          </button>
          <button
            type="button"
            className="buttonSecondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

function JobDrawer({
  job,
  caseId,
  canRetry,
  retrying,
  onRetry,
  onClose,
}: {
  job: ConnectorJobView;
  caseId: string;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="drawer" role="dialog" aria-label="Connector job details">
      <div className="drawerHeader">
        <div>
          <p className="eyebrow">{job.connectorKey}</p>
          <h2>{job.targetSummary ?? job.id}</h2>
        </div>
        <button type="button" className="modalClose" onClick={onClose}>
          Close
        </button>
      </div>

      <dl className="detailList">
        <div>
          <dt>Status</dt>
          <dd>
            <span className="pill">{STATUS_LABELS[job.status]}</span>
            {job.statusMessage ? ` ${job.statusMessage}` : null}
          </dd>
        </div>
        <div>
          <dt>Requested</dt>
          <dd>
            {new Date(job.queuedAt).toLocaleString()} by{" "}
            {job.requestedBy.displayName}
          </dd>
        </div>
        {job.completedAt ? (
          <div>
            <dt>Completed</dt>
            <dd>{new Date(job.completedAt).toLocaleString()}</dd>
          </div>
        ) : null}
        <div>
          <dt>Connector version</dt>
          <dd>{job.connectorVersion}</dd>
        </div>
        {job.errorCode ? (
          <div>
            <dt>Failure</dt>
            <dd>
              <span className="hashValue">{job.errorCode}</span>
              {job.errorMessage ? ` — ${job.errorMessage}` : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {job.attempts.length > 0 ? (
        <>
          <h3 className="drawerSectionTitle">Attempts</h3>
          <ol className="attemptList">
            {job.attempts.map((attempt) => (
              <li key={attempt.attemptNumber}>
                <strong>#{attempt.attemptNumber}</strong>{" "}
                {new Date(attempt.startedAt).toLocaleString()} —{" "}
                {attempt.succeeded === true
                  ? "succeeded"
                  : attempt.succeeded === false
                    ? `failed (${attempt.errorCode ?? "unknown"}${attempt.retryable ? ", retryable" : ""})`
                    : "in progress"}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      <div className="drawerActions">
        {job.resultEvidenceId ? (
          <Link className="buttonPrimary" href={`/cases/${caseId}/sources`}>
            View evidence in source register
          </Link>
        ) : null}
        {job.retryable && canRetry ? (
          <button
            type="button"
            className="buttonSecondary"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? "Requeueing…" : "Retry capture"}
          </button>
        ) : null}
        {job.retryable && !canRetry ? (
          <span className="pill" title="Retries are limited to analyst roles">
            Retry not permitted for your role
          </span>
        ) : null}
      </div>
    </aside>
  );
}

export default function CaseJobsPage() {
  const { detail, can } = useCase();
  const caseId = detail.case.id;

  const [result, setResult] = useState<{
    state: "loading" | "error" | "ready";
    jobs: ConnectorJobView[];
    nextCursor?: string;
  }>({ state: "loading", jobs: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setResult((previous) => ({ ...previous, state: "loading" }));
    try {
      const response = await apiFetch<ConnectorJobListResponse>(
        `/v1/cases/${caseId}/connector-jobs?limit=50`,
      );
      setResult({
        state: "ready",
        jobs: response.data,
        ...(response.nextCursor ? { nextCursor: response.nextCursor } : {}),
      });
    } catch {
      setResult({ state: "error", jobs: [] });
    }
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeJobIds = result.jobs
    .filter((job) => ACTIVE_STATUSES.has(job.status))
    .map((job) => job.id)
    .join(",");

  // Poll only jobs that are still queued or running, at a bounded interval.
  // Terminal jobs stop polling on their own because the filter empties.
  useEffect(() => {
    if (!activeJobIds) return;
    const ids = activeJobIds.split(",");
    const timer = setInterval(() => {
      void (async () => {
        const updates = await Promise.all(
          ids.map((jobId) =>
            apiFetch<{ data: ConnectorJobView }>(
              `/v1/cases/${caseId}/connector-jobs/${jobId}`,
            ).then(
              (response) => response.data,
              () => null,
            ),
          ),
        );
        const byId = new Map(
          updates
            .filter((job): job is ConnectorJobView => job !== null)
            .map((job) => [job.id, job]),
        );
        if (byId.size === 0) return;
        setResult((previous) => ({
          ...previous,
          jobs: previous.jobs.map((job) => byId.get(job.id) ?? job),
        }));
      })();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeJobIds, caseId]);

  async function loadMore() {
    if (!result.nextCursor) return;
    setLoadingMore(true);
    try {
      const response = await apiFetch<ConnectorJobListResponse>(
        `/v1/cases/${caseId}/connector-jobs?limit=50&cursor=${result.nextCursor}`,
      );
      setResult((previous) => ({
        state: "ready",
        jobs: [...previous.jobs, ...response.data],
        ...(response.nextCursor ? { nextCursor: response.nextCursor } : {}),
      }));
    } catch {
      // Keep the current page; the retry affordance is the button itself.
    } finally {
      setLoadingMore(false);
    }
  }

  async function retryJob(jobId: string) {
    setRetryingId(jobId);
    setRetryError(null);
    try {
      const response = await apiFetch<{ data: ConnectorJobView }>(
        `/v1/cases/${caseId}/connector-jobs/${jobId}/retry`,
        { method: "POST" },
      );
      setResult((previous) => ({
        ...previous,
        jobs: previous.jobs.map((job) =>
          job.id === jobId ? response.data : job,
        ),
      }));
    } catch (caught) {
      setRetryError(
        caught instanceof ApiError
          ? caught.message
          : "The job could not be retried. Try again.",
      );
    } finally {
      setRetryingId(null);
    }
  }

  const canRun = can("connector.run");
  const canRetry = can("connector.retry");
  const selected = result.jobs.find((job) => job.id === selectedId) ?? null;
  const activeCount = result.jobs.filter((job) =>
    ACTIVE_STATUSES.has(job.status),
  ).length;

  function handleQueued() {
    setShowCapture(false);
    void load();
  }

  return (
    <main className="page">
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Collection jobs</p>
          <p className="pageLede">
            Queued, running, and completed collection runs with their
            outcomes. Captured pages land in the source register.
          </p>
        </div>
        {canRun ? (
          <button
            type="button"
            className="buttonPrimary"
            onClick={() => setShowCapture(true)}
          >
            Capture web page
          </button>
        ) : (
          <span className="pill" title="Your role cannot start collection jobs">
            Read-only jobs
          </span>
        )}
      </div>

      <p className="stateNote" aria-live="polite">
        {activeCount > 0
          ? `${activeCount} job${activeCount === 1 ? "" : "s"} in progress — updating automatically.`
          : null}
      </p>
      {retryError ? (
        <p className="formError" role="alert">
          {retryError}
        </p>
      ) : null}

      {result.state === "loading" ? (
        <p className="stateNote" aria-live="polite">
          Loading jobs…
        </p>
      ) : result.state === "error" ? (
        <div className="stateNote" role="alert">
          <p>The job list could not be loaded.</p>
          <button
            type="button"
            className="buttonSecondary"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : result.jobs.length === 0 ? (
        <div className="emptyState">
          <h2>No collection jobs yet</h2>
          <p>
            {canRun
              ? "Queue a web page capture to collect your first source."
              : "Your role can follow collection jobs once they are queued."}
          </p>
        </div>
      ) : (
        <>
          <table className="dataTable">
            <thead>
              <tr>
                <th scope="col">Target</th>
                <th scope="col">Status</th>
                <th scope="col">Progress</th>
                <th scope="col">Attempts</th>
                <th scope="col">Queued</th>
                <th scope="col">Outcome</th>
                <th scope="col">
                  <span className="srOnly">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <button
                      type="button"
                      className="rowLink linkButton"
                      onClick={() => setSelectedId(job.id)}
                    >
                      {job.targetSummary ?? job.connectorKey}
                    </button>
                    <span className="cellSub">{job.connectorKey}</span>
                  </td>
                  <td>
                    <span className="pill">{STATUS_LABELS[job.status]}</span>
                  </td>
                  <td>
                    {ACTIVE_STATUSES.has(job.status) ? (
                      <>
                        <progress
                          max={100}
                          value={job.progress}
                          aria-label={`Progress: ${job.progress} percent`}
                        />
                        <span className="cellSub">
                          {job.statusMessage ?? `${job.progress}%`}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{job.attemptCount}</td>
                  <td>{new Date(job.queuedAt).toLocaleString()}</td>
                  <td>
                    {job.status === "SUCCEEDED" ? (
                      <Link href={`/cases/${caseId}/sources`}>
                        Evidence captured
                      </Link>
                    ) : job.errorCode ? (
                      <span className="hashValue">{job.errorCode}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {job.retryable && canRetry ? (
                      <button
                        type="button"
                        className="buttonSecondary"
                        onClick={() => void retryJob(job.id)}
                        disabled={retryingId === job.id}
                      >
                        {retryingId === job.id ? "Requeueing…" : "Retry"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      {showCapture ? (
        <CaptureDialog
          caseId={caseId}
          onClose={() => setShowCapture(false)}
          onQueued={handleQueued}
        />
      ) : null}
      {selected ? (
        <JobDrawer
          job={selected}
          caseId={caseId}
          canRetry={canRetry}
          retrying={retryingId === selected.id}
          onRetry={() => void retryJob(selected.id)}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </main>
  );
}
