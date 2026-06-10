"use client";

import type { EvidenceItemView, EvidenceListResponse } from "@evidara/contracts";
import { useRouter, useSearchParams } from "next/navigation";
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

const KIND_LABELS: Record<EvidenceItemView["kind"], string> = {
  WEB_CAPTURE: "Web capture",
  FILE: "File",
  MANUAL: "Manual",
  CONNECTOR_RESULT: "Connector",
};

const STATUS_LABELS: Record<EvidenceItemView["status"], string> = {
  UNREVIEWED: "Unreviewed",
  VERIFIED: "Verified",
  DISPUTED: "Disputed",
  STALE: "Stale",
  EXCLUDED: "Excluded",
};

const HANDLING_OPTIONS = [
  ["PUBLIC", "Public"],
  ["INTERNAL", "Internal"],
  ["SENSITIVE", "Sensitive"],
  ["RESTRICTED", "Restricted"],
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes;
  let unit = "B";
  for (const next of ["KB", "MB", "GB"]) {
    value /= 1024;
    unit = next;
    if (value < 1024) break;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`;
}

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

function UploadDialog({
  caseId,
  onClose,
  onCreated,
}: {
  caseId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [handlingLevel, setHandlingLevel] = useState("INTERNAL");
  const [analystNotes, setAnalystNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      // Metadata fields must precede the file part; the API validates them
      // before accepting any bytes.
      if (title.trim()) form.append("title", title.trim());
      if (sourceUrl.trim()) form.append("sourceUrl", sourceUrl.trim());
      form.append("handlingLevel", handlingLevel);
      if (analystNotes.trim()) form.append("analystNotes", analystNotes.trim());
      form.append("file", file);
      await apiFetch(`/v1/cases/${caseId}/evidence/files`, {
        method: "POST",
        body: form,
        headers: { "idempotency-key": idempotencyKey },
      });
      onCreated();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The upload failed. Try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Upload file evidence" onClose={onClose}>
      <form className="stackedForm" onSubmit={handleSubmit}>
        <fieldset disabled={submitting}>
          <label htmlFor="upload-file">File</label>
          <input
            id="upload-file"
            type="file"
            required
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="fieldHint">
            The server verifies content type and records a SHA-256 hash while
            storing the original bytes unchanged.
          </p>

          <label htmlFor="upload-title">Title (optional)</label>
          <input
            id="upload-title"
            type="text"
            maxLength={500}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Defaults to the file name"
          />

          <label htmlFor="upload-source-url">Source URL (optional)</label>
          <input
            id="upload-source-url"
            type="url"
            maxLength={2048}
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://example.org/original-location"
          />

          <label htmlFor="upload-handling">Handling level</label>
          <select
            id="upload-handling"
            value={handlingLevel}
            onChange={(event) => setHandlingLevel(event.target.value)}
          >
            {HANDLING_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label htmlFor="upload-notes">Analyst notes (optional)</label>
          <textarea
            id="upload-notes"
            rows={3}
            maxLength={10000}
            value={analystNotes}
            onChange={(event) => setAnalystNotes(event.target.value)}
          />
        </fieldset>

        {error ? (
          <p className="formError" role="alert">
            {error}
          </p>
        ) : null}

        <div className="formActions">
          <button type="submit" className="buttonPrimary" disabled={submitting}>
            {submitting ? "Uploading…" : "Upload"}
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

function ManualEvidenceDialog({
  caseId,
  onClose,
  onCreated,
}: {
  caseId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [form, setForm] = useState({
    title: "",
    description: "",
    sourceUrl: "",
    observedAt: "",
    handlingLevel: "INTERNAL",
    analystNotes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/v1/cases/${caseId}/evidence/manual`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: {
          title: form.title.trim(),
          ...(form.description.trim()
            ? { description: form.description.trim() }
            : {}),
          ...(form.sourceUrl.trim() ? { sourceUrl: form.sourceUrl.trim() } : {}),
          ...(form.observedAt
            ? { observedAt: new Date(form.observedAt).toISOString() }
            : {}),
          handlingLevel: form.handlingLevel,
          ...(form.analystNotes.trim()
            ? { analystNotes: form.analystNotes.trim() }
            : {}),
        },
      });
      onCreated();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The evidence could not be saved. Try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Add manual evidence" onClose={onClose}>
      <form className="stackedForm" onSubmit={handleSubmit}>
        <fieldset disabled={submitting}>
          <label htmlFor="manual-title">Title</label>
          <input
            id="manual-title"
            type="text"
            required
            maxLength={500}
            value={form.title}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, title: event.target.value }))
            }
          />

          <label htmlFor="manual-description">Description (optional)</label>
          <textarea
            id="manual-description"
            rows={4}
            maxLength={10000}
            value={form.description}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                description: event.target.value,
              }))
            }
            placeholder="What was observed, where, and why it matters."
          />

          <label htmlFor="manual-source-url">Source URL (optional)</label>
          <input
            id="manual-source-url"
            type="url"
            maxLength={2048}
            value={form.sourceUrl}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                sourceUrl: event.target.value,
              }))
            }
          />

          <label htmlFor="manual-observed-at">Observed at (optional)</label>
          <input
            id="manual-observed-at"
            type="datetime-local"
            value={form.observedAt}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                observedAt: event.target.value,
              }))
            }
          />

          <label htmlFor="manual-handling">Handling level</label>
          <select
            id="manual-handling"
            value={form.handlingLevel}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                handlingLevel: event.target.value,
              }))
            }
          >
            {HANDLING_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label htmlFor="manual-notes">Analyst notes (optional)</label>
          <textarea
            id="manual-notes"
            rows={3}
            maxLength={10000}
            value={form.analystNotes}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                analystNotes: event.target.value,
              }))
            }
          />
        </fieldset>

        {error ? (
          <p className="formError" role="alert">
            {error}
          </p>
        ) : null}

        <div className="formActions">
          <button type="submit" className="buttonPrimary" disabled={submitting}>
            {submitting ? "Saving…" : "Add evidence"}
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

function ProvenanceDrawer({
  item,
  canDownload,
  onClose,
}: {
  item: EvidenceItemView;
  canDownload: boolean;
  onClose: () => void;
}) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await apiFetch<{
        data: { url: string; filename: string };
      }>(`/v1/cases/${item.caseId}/evidence/${item.id}/download`);
      const anchor = document.createElement("a");
      anchor.href = response.data.url;
      anchor.rel = "noopener";
      anchor.click();
    } catch (caught) {
      setDownloadError(
        caught instanceof ApiError
          ? caught.message
          : "The download could not be prepared. Try again.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <aside className="drawer" role="dialog" aria-label="Evidence provenance">
      <div className="drawerHeader">
        <div>
          <p className="eyebrow">{KIND_LABELS[item.kind]} evidence</p>
          <h2>{item.title}</h2>
        </div>
        <button type="button" className="modalClose" onClick={onClose}>
          Close
        </button>
      </div>

      <dl className="detailList">
        <div>
          <dt>Status</dt>
          <dd>{STATUS_LABELS[item.status]}</dd>
        </div>
        <div>
          <dt>Handling level</dt>
          <dd>
            <span
              className={`pill handling-${item.handlingLevel.toLowerCase()}`}
            >
              {item.handlingLevel}
            </span>
          </dd>
        </div>
        {item.blob ? (
          <>
            <div>
              <dt>SHA-256</dt>
              <dd className="hashValue">{item.blob.sha256}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>
                {formatBytes(item.blob.byteSize)} ({item.blob.byteSize} bytes)
              </dd>
            </div>
            <div>
              <dt>Detected content type</dt>
              <dd>{item.blob.mediaType}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt>Content</dt>
            <dd>No binary content — manually recorded evidence.</dd>
          </div>
        )}
        {item.originalFilename ? (
          <div>
            <dt>Original filename</dt>
            <dd className="hashValue">{item.originalFilename}</dd>
          </div>
        ) : null}
        {item.sourceUrl ? (
          <div>
            <dt>Source URL</dt>
            <dd className="hashValue">{item.sourceUrl}</dd>
          </div>
        ) : null}
        <div>
          <dt>Collection method</dt>
          <dd>{item.sourceMethod}</dd>
        </div>
        <div>
          <dt>Collected</dt>
          <dd>
            {new Date(item.collectedAt).toLocaleString()} by{" "}
            {item.collectedBy.displayName}
          </dd>
        </div>
        {item.observedAt ? (
          <div>
            <dt>Observed</dt>
            <dd>{new Date(item.observedAt).toLocaleString()}</dd>
          </div>
        ) : null}
        {item.publishedAt ? (
          <div>
            <dt>Published</dt>
            <dd>{new Date(item.publishedAt).toLocaleString()}</dd>
          </div>
        ) : null}
        <div>
          <dt>Completeness</dt>
          <dd>{item.collectionCompleteness}</dd>
        </div>
        {item.description ? (
          <div>
            <dt>Description</dt>
            <dd>{item.description}</dd>
          </div>
        ) : null}
        {item.analystNotes ? (
          <div>
            <dt>Analyst notes</dt>
            <dd>{item.analystNotes}</dd>
          </div>
        ) : null}
      </dl>

      {downloadError ? (
        <p className="formError" role="alert">
          {downloadError}
        </p>
      ) : null}

      <div className="drawerActions">
        {item.blob && canDownload ? (
          <button
            type="button"
            className="buttonPrimary"
            onClick={() => void handleDownload()}
            disabled={downloading}
          >
            {downloading ? "Preparing…" : "Download original"}
          </button>
        ) : null}
        {item.blob && !canDownload ? (
          <span className="pill" title="Downloads are limited to analyst roles">
            Download not permitted for your role
          </span>
        ) : null}
      </div>
    </aside>
  );
}

export default function CaseSourcesPage() {
  const { detail, can } = useCase();
  const caseId = detail.case.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const kind = searchParams.get("kind") ?? "";
  const status = searchParams.get("status") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const [search, setSearch] = useState(q);
  const [result, setResult] = useState<{
    state: "loading" | "error" | "ready";
    items: EvidenceItemView[];
    nextCursor?: string;
  }>({ state: "loading", items: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [dialog, setDialog] = useState<"upload" | "manual" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const buildQuery = useCallback(
    (cursor?: string) => {
      const query = new URLSearchParams({ limit: "50" });
      if (q) query.set("q", q);
      if (kind) query.set("kind", kind);
      if (status) query.set("status", status);
      if (from) {
        query.set(
          "collectedFrom",
          new Date(`${from}T00:00:00`).toISOString(),
        );
      }
      if (to) {
        query.set("collectedTo", new Date(`${to}T23:59:59.999`).toISOString());
      }
      if (cursor) query.set("cursor", cursor);
      return query;
    },
    [q, kind, status, from, to],
  );

  const load = useCallback(async () => {
    setResult((previous) => ({ ...previous, state: "loading" }));
    try {
      const response = await apiFetch<EvidenceListResponse>(
        `/v1/cases/${caseId}/evidence?${buildQuery().toString()}`,
      );
      setResult({
        state: "ready",
        items: response.data,
        ...(response.nextCursor ? { nextCursor: response.nextCursor } : {}),
      });
    } catch {
      setResult({ state: "error", items: [] });
    }
  }, [caseId, buildQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!result.nextCursor) return;
    setLoadingMore(true);
    try {
      const response = await apiFetch<EvidenceListResponse>(
        `/v1/cases/${caseId}/evidence?${buildQuery(result.nextCursor).toString()}`,
      );
      setResult((previous) => ({
        state: "ready",
        items: [...previous.items, ...response.data],
        ...(response.nextCursor ? { nextCursor: response.nextCursor } : {}),
      }));
    } catch {
      // Keep the current page; the retry affordance is the button itself.
    } finally {
      setLoadingMore(false);
    }
  }

  function applyFilters(next: {
    q?: string;
    kind?: string;
    status?: string;
    from?: string;
    to?: string;
  }) {
    const params = new URLSearchParams();
    const merged = { q, kind, status, from, to, ...next };
    if (merged.q) params.set("q", merged.q);
    if (merged.kind) params.set("kind", merged.kind);
    if (merged.status) params.set("status", merged.status);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    router.replace(`/cases/${caseId}/sources?${params.toString()}`);
  }

  const canCreate = can("evidence.create");
  const canDownload = can("evidence.download");
  const hasFilters = Boolean(q || kind || status || from || to);
  const selected = result.items.find((item) => item.id === selectedId) ?? null;

  function handleCreated() {
    setDialog(null);
    void load();
  }

  return (
    <main className="page">
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Source register</p>
          <p className="pageLede">
            Every piece of evidence with its hash, provenance, and review
            state.
          </p>
        </div>
        {canCreate ? (
          <div className="sourcesToolbar">
            <button
              type="button"
              className="buttonSecondary"
              onClick={() => setDialog("manual")}
            >
              Add manual evidence
            </button>
            <button
              type="button"
              className="buttonPrimary"
              onClick={() => setDialog("upload")}
            >
              Upload file
            </button>
          </div>
        ) : (
          <span className="pill" title="Your role cannot add evidence">
            Read-only register
          </span>
        )}
      </div>

      <form
        className="filterBar"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters({ q: search.trim() });
        }}
      >
        <label className="srOnly" htmlFor="evidence-search">
          Search evidence by title
        </label>
        <input
          id="evidence-search"
          type="search"
          placeholder="Search by title…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="srOnly" htmlFor="evidence-kind">
          Filter by kind
        </label>
        <select
          id="evidence-kind"
          value={kind}
          onChange={(event) => applyFilters({ kind: event.target.value })}
        >
          <option value="">All kinds</option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="srOnly" htmlFor="evidence-status">
          Filter by review status
        </label>
        <select
          id="evidence-status"
          value={status}
          onChange={(event) => applyFilters({ status: event.target.value })}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="srOnly" htmlFor="evidence-from">
          Collected on or after
        </label>
        <input
          id="evidence-from"
          type="date"
          value={from}
          onChange={(event) => applyFilters({ from: event.target.value })}
        />
        <label className="srOnly" htmlFor="evidence-to">
          Collected on or before
        </label>
        <input
          id="evidence-to"
          type="date"
          value={to}
          onChange={(event) => applyFilters({ to: event.target.value })}
        />
        <button type="submit" className="buttonSecondary">
          Search
        </button>
      </form>

      {result.state === "loading" ? (
        <p className="stateNote" aria-live="polite">
          Loading evidence…
        </p>
      ) : result.state === "error" ? (
        <div className="stateNote" role="alert">
          <p>The source register could not be loaded.</p>
          <button
            type="button"
            className="buttonSecondary"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      ) : result.items.length === 0 ? (
        <div className="emptyState">
          <h2>{hasFilters ? "No matching evidence" : "No evidence yet"}</h2>
          <p>
            {hasFilters
              ? "No evidence matches the current filters."
              : canCreate
                ? "Upload a file or record manual evidence to start the register."
                : "Your role can read evidence once it is collected."}
          </p>
        </div>
      ) : (
        <>
          <table className="dataTable">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Kind</th>
                <th scope="col">Status</th>
                <th scope="col">Collected</th>
                <th scope="col">Collector</th>
                <th scope="col">Size</th>
                <th scope="col">SHA-256</th>
                <th scope="col">Handling</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button
                      type="button"
                      className="rowLink linkButton"
                      onClick={() => setSelectedId(item.id)}
                    >
                      {item.title}
                    </button>
                    {item.originalFilename &&
                    item.originalFilename !== item.title ? (
                      <span className="cellSub">{item.originalFilename}</span>
                    ) : item.sourceUrl ? (
                      <span className="cellSub">{item.sourceUrl}</span>
                    ) : null}
                  </td>
                  <td>
                    <span className="pill">{KIND_LABELS[item.kind]}</span>
                  </td>
                  <td>
                    <span className="pill">{STATUS_LABELS[item.status]}</span>
                  </td>
                  <td>{new Date(item.collectedAt).toLocaleString()}</td>
                  <td>{item.collectedBy.displayName}</td>
                  <td>{item.blob ? formatBytes(item.blob.byteSize) : "—"}</td>
                  <td>
                    {item.blob ? (
                      <span className="hashValue">
                        {item.blob.sha256.slice(0, 12)}…
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span
                      className={`pill handling-${item.handlingLevel.toLowerCase()}`}
                    >
                      {item.handlingLevel}
                    </span>
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

      {dialog === "upload" ? (
        <UploadDialog
          caseId={caseId}
          onClose={() => setDialog(null)}
          onCreated={handleCreated}
        />
      ) : null}
      {dialog === "manual" ? (
        <ManualEvidenceDialog
          caseId={caseId}
          onClose={() => setDialog(null)}
          onCreated={handleCreated}
        />
      ) : null}
      {selected ? (
        <ProvenanceDrawer
          item={selected}
          canDownload={canDownload}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </main>
  );
}
