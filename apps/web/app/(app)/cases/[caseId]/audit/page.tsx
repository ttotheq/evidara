"use client";

import { useCase } from "../case-context";

export default function CaseAuditPage() {
  const { can } = useCase();

  return (
    <main className="page">
      {can("audit.read") ? (
        <div className="emptyState">
          <h2>Audit timeline</h2>
          <p>
            Every mutation, download, and collection run in this case is
            recorded append-only. The audit timeline view arrives with an
            upcoming milestone.
          </p>
        </div>
      ) : (
        <div className="emptyState">
          <h2>Audit access required</h2>
          <p>
            Your role cannot read the audit log of this case. Case owners and
            reviewers can.
          </p>
        </div>
      )}
    </main>
  );
}
