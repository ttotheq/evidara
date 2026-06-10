"use client";

import { useCase } from "../case-context";

export default function CaseJobsPage() {
  const { can } = useCase();

  return (
    <main className="page">
      <div className="emptyState">
        <h2>No collection jobs yet</h2>
        <p>
          Connector jobs show queued, running, and completed collection runs
          with their outcomes.
          {can("connector.run")
            ? " Secure web capture arrives with the next milestone."
            : " Your role cannot start collection jobs."}
        </p>
      </div>
    </main>
  );
}
