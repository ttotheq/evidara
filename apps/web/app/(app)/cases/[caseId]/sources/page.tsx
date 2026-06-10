"use client";

import { useCase } from "../case-context";

export default function CaseSourcesPage() {
  const { can } = useCase();

  return (
    <main className="page">
      <div className="emptyState">
        <h2>No evidence sources yet</h2>
        <p>
          The source register lists every piece of evidence with its hash,
          provenance, and review state.
          {can("evidence.create")
            ? " Evidence upload and secure web capture arrive with the next milestone."
            : " Your role can read evidence once it is collected."}
        </p>
      </div>
    </main>
  );
}
