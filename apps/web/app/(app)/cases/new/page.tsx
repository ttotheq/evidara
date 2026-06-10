"use client";

import type { Case } from "@evidara/contracts";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "../../../../lib/api";
import { useAuth } from "../../../../lib/auth";

const HANDLING_OPTIONS = [
  ["PUBLIC", "Public — releasable findings"],
  ["INTERNAL", "Internal — default for organization work"],
  ["SENSITIVE", "Sensitive — limit to people with a need to know"],
  ["RESTRICTED", "Restricted — explicit case membership only"],
] as const;

export default function NewCasePage() {
  const router = useRouter();
  const auth = useAuth();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const [form, setForm] = useState({
    name: "",
    objective: "",
    scope: "",
    justification: "",
    handlingLevel: "INTERNAL",
    prohibitedCollection: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<Key extends keyof typeof form>(
    key: Key,
    value: (typeof form)[Key],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!auth.activeOrganization) {
      setError("You do not belong to an organization that can hold cases.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiFetch<{ data: Case }>("/v1/cases", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: {
          organizationId: auth.activeOrganization.organizationId,
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
      router.push(`/cases/${response.data.id}/overview`);
    } catch (caught) {
      setSubmitting(false);
      if (caught instanceof ApiError && caught.status === 403) {
        setError("You are not allowed to create cases in this organization.");
      } else if (caught instanceof ApiError && caught.status === 400) {
        setError(
          "Some fields are invalid. Names need 3+ characters; objective, scope, and justification need 10+.",
        );
      } else {
        setError("The case could not be created. Try again.");
      }
    }
  }

  return (
    <main className="page pageNarrow">
      <p className="eyebrow">New case</p>
      <h1 className="pageTitle">Open an investigation</h1>
      <p className="pageLede">
        Define the objective and boundaries first. Everything collected later is
        evaluated against this scope.
      </p>

      <form className="stackedForm" onSubmit={handleSubmit} aria-busy={submitting}>
        <label htmlFor="case-name">Case name</label>
        <input
          id="case-name"
          required
          minLength={3}
          maxLength={160}
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
        />

        <label htmlFor="case-objective">Objective</label>
        <textarea
          id="case-objective"
          required
          minLength={10}
          rows={3}
          value={form.objective}
          onChange={(event) => update("objective", event.target.value)}
        />
        <p className="fieldHint">What question should this case answer?</p>

        <label htmlFor="case-scope">Scope</label>
        <textarea
          id="case-scope"
          required
          minLength={10}
          rows={3}
          value={form.scope}
          onChange={(event) => update("scope", event.target.value)}
        />
        <p className="fieldHint">
          Sources, targets, and timeframes that are in bounds.
        </p>

        <label htmlFor="case-justification">Justification</label>
        <textarea
          id="case-justification"
          required
          minLength={10}
          rows={3}
          value={form.justification}
          onChange={(event) => update("justification", event.target.value)}
        />
        <p className="fieldHint">Why this investigation is warranted.</p>

        <label htmlFor="case-handling">Handling level</label>
        <select
          id="case-handling"
          value={form.handlingLevel}
          onChange={(event) => update("handlingLevel", event.target.value)}
        >
          {HANDLING_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <label htmlFor="case-prohibited">
          Prohibited collection (one boundary per line)
        </label>
        <textarea
          id="case-prohibited"
          rows={3}
          placeholder={"No contact with subjects\nNo authenticated-area collection"}
          value={form.prohibitedCollection}
          onChange={(event) => update("prohibitedCollection", event.target.value)}
        />
        <p className="fieldHint">
          Hard boundaries connectors and analysts must not cross.
        </p>

        {error ? (
          <p className="formError" role="alert">
            {error}
          </p>
        ) : null}

        <div className="formActions">
          <button type="submit" className="buttonPrimary" disabled={submitting}>
            {submitting ? "Creating…" : "Create case"}
          </button>
          <button
            type="button"
            className="buttonSecondary"
            onClick={() => router.push("/cases")}
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
