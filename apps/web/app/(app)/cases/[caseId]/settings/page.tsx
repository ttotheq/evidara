"use client";

import { useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "../../../../../lib/api";
import { useCase } from "../case-context";

const HANDLING_OPTIONS = [
  ["PUBLIC", "Public — releasable findings"],
  ["INTERNAL", "Internal — default for organization work"],
  ["SENSITIVE", "Sensitive — limit to people with a need to know"],
  ["RESTRICTED", "Restricted — explicit case membership only"],
] as const;

export default function CaseSettingsPage() {
  const { detail, refresh, can } = useCase();
  const item = detail.case;
  const canUpdate = can("case.update");

  const [form, setForm] = useState({
    name: item.name,
    objective: item.objective,
    scope: item.scope,
    justification: item.justification,
    handlingLevel: item.handlingLevel,
    prohibitedCollection: item.prohibitedCollection.join("\n"),
  });
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error" | "conflict";
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<Key extends keyof typeof form>(
    key: Key,
    value: (typeof form)[Key],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      await apiFetch(`/v1/cases/${item.id}`, {
        method: "PATCH",
        headers: { "if-match": String(item.version) },
        body: {
          name: form.name.trim(),
          objective: form.objective.trim(),
          scope: form.scope.trim(),
          justification: form.justification.trim(),
          handlingLevel: form.handlingLevel,
          prohibitedCollection: form.prohibitedCollection
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
        },
      });
      await refresh();
      setFeedback({ kind: "success", message: "Case settings saved." });
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 412) {
        setFeedback({
          kind: "conflict",
          message:
            "Someone else changed this case while you were editing. Reload to see the latest version before saving again.",
        });
      } else if (caught instanceof ApiError && caught.status === 403) {
        setFeedback({
          kind: "error",
          message: "Your role cannot update this case.",
        });
      } else {
        setFeedback({
          kind: "error",
          message: "The changes could not be saved. Try again.",
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchiveToggle() {
    setSubmitting(true);
    setFeedback(null);
    try {
      await apiFetch(`/v1/cases/${item.id}`, {
        method: "PATCH",
        headers: { "if-match": String(item.version) },
        body: { status: item.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" },
      });
      await refresh();
      setFeedback({
        kind: "success",
        message:
          item.status === "ACTIVE"
            ? "Case archived. It stays readable and auditable."
            : "Case reactivated.",
      });
    } catch {
      setFeedback({
        kind: "error",
        message: "The status change could not be saved. Reload and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page pageNarrow">
      {!canUpdate ? (
        <div className="noticeBox" role="note">
          You have view-only access to this case. Settings are shown for
          reference; a case owner or analyst can change them.
        </div>
      ) : null}

      <form className="stackedForm" onSubmit={handleSubmit} aria-busy={submitting}>
        <fieldset disabled={!canUpdate || submitting}>
          <label htmlFor="settings-name">Case name</label>
          <input
            id="settings-name"
            required
            minLength={3}
            maxLength={160}
            value={form.name}
            onChange={(event) => update("name", event.target.value)}
          />

          <label htmlFor="settings-objective">Objective</label>
          <textarea
            id="settings-objective"
            required
            minLength={10}
            rows={3}
            value={form.objective}
            onChange={(event) => update("objective", event.target.value)}
          />

          <label htmlFor="settings-scope">Scope</label>
          <textarea
            id="settings-scope"
            required
            minLength={10}
            rows={3}
            value={form.scope}
            onChange={(event) => update("scope", event.target.value)}
          />

          <label htmlFor="settings-justification">Justification</label>
          <textarea
            id="settings-justification"
            required
            minLength={10}
            rows={3}
            value={form.justification}
            onChange={(event) => update("justification", event.target.value)}
          />

          <label htmlFor="settings-handling">Handling level</label>
          <select
            id="settings-handling"
            value={form.handlingLevel}
            onChange={(event) =>
              update(
                "handlingLevel",
                event.target.value as (typeof form)["handlingLevel"],
              )
            }
          >
            {HANDLING_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label htmlFor="settings-prohibited">
            Prohibited collection (one boundary per line)
          </label>
          <textarea
            id="settings-prohibited"
            rows={3}
            value={form.prohibitedCollection}
            onChange={(event) =>
              update("prohibitedCollection", event.target.value)
            }
          />

          <div className="formActions">
            <button type="submit" className="buttonPrimary">
              {submitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </fieldset>
      </form>

      {feedback ? (
        <p
          className={feedback.kind === "success" ? "formSuccess" : "formError"}
          role={feedback.kind === "success" ? "status" : "alert"}
        >
          {feedback.message}
          {feedback.kind === "conflict" ? (
            <>
              {" "}
              <button
                type="button"
                className="buttonSecondary"
                onClick={() => void refresh()}
              >
                Reload case
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {canUpdate ? (
        <section className="panel dangerPanel">
          <h2>{item.status === "ACTIVE" ? "Archive case" : "Reactivate case"}</h2>
          <p className="muted">
            {item.status === "ACTIVE"
              ? "Archiving closes active work. The case, its evidence, and its audit trail remain readable."
              : "This case is archived. Reactivate it to resume work."}
          </p>
          <button
            type="button"
            className="buttonSecondary"
            disabled={submitting}
            onClick={() => void handleArchiveToggle()}
          >
            {item.status === "ACTIVE" ? "Archive case" : "Reactivate case"}
          </button>
        </section>
      ) : null}
    </main>
  );
}
