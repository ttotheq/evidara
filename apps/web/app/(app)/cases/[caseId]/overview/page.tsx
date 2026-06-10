"use client";

import { useCase } from "../case-context";

export default function CaseOverviewPage() {
  const { detail } = useCase();
  const item = detail.case;

  return (
    <main className="page">
      <section className="overviewGrid">
        <article className="panel">
          <h2>Objective</h2>
          <p>{item.objective}</p>
        </article>
        <article className="panel">
          <h2>Scope</h2>
          <p>{item.scope}</p>
        </article>
        <article className="panel">
          <h2>Justification</h2>
          <p>{item.justification}</p>
        </article>
        <article className="panel">
          <h2>Prohibited collection</h2>
          {item.prohibitedCollection.length === 0 ? (
            <p className="muted">No explicit boundaries recorded.</p>
          ) : (
            <ul>
              {item.prohibitedCollection.map((boundary) => (
                <li key={boundary}>{boundary}</li>
              ))}
            </ul>
          )}
        </article>
        <article className="panel">
          <h2>Details</h2>
          <dl className="detailList">
            <div>
              <dt>Status</dt>
              <dd>{item.status === "ACTIVE" ? "Active" : "Archived"}</dd>
            </div>
            <div>
              <dt>Handling level</dt>
              <dd>{item.handlingLevel}</dd>
            </div>
            <div>
              <dt>Your role</dt>
              <dd>{detail.caseRole ?? "Organization oversight"}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(item.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{new Date(item.updatedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Record version</dt>
              <dd>{item.version}</dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
