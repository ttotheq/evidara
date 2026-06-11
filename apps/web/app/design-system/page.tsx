"use client";

import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { ThemeToggle } from "../../lib/theme";

// Development-only living styleguide for docs/design/tokens.md and
// docs/design/components.md. Inline styles below are demo scaffolding
// (swatch grids, un-fixing the drawer) and deliberately stay out of the
// production stylesheet.

const COLOR_TOKENS = [
  "--background",
  "--panel",
  "--ink",
  "--muted",
  "--line",
  "--accent",
  "--accent-ink",
  "--danger-border",
  "--danger-surface",
  "--danger-ink",
  "--success-border",
  "--success-surface",
  "--success-ink",
  "--warning-border",
  "--danger-accent",
  "--danger-accent-ink",
  "--card-border",
  "--track",
];

const TEXT_TOKENS = [
  ["--text-xs", "Eyebrows, table headers, metadata"],
  ["--text-sm", "Pills, labels, hints"],
  ["--text-md", "Form feedback, tabs"],
  ["--text-base", "Detail-list values"],
  ["--text-lg", "Panel headings"],
  ["--text-xl", "Modal and drawer headings"],
  ["--text-2xl", "Marketing article headings"],
  ["--text-3xl", "Marketing stat values"],
  ["--text-4xl", "Empty-state headings"],
  ["--text-5xl", "Auth card headings"],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 48 }}>
      <h2 style={{ fontSize: "var(--text-xl)", margin: "0 0 16px" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}
    >
      {children}
    </div>
  );
}

const swatchStyle: CSSProperties = {
  width: 150,
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-control)",
  overflow: "hidden",
};

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="page" style={{ overflow: "visible" }}>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Design system</p>
          <h1 className="pageTitle">Tokens and components</h1>
          <p className="pageLede">
            Living reference for docs/design/tokens.md and components.md.
            Development only — this route is a 404 in production builds.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <Section title="Color tokens">
        <Row>
          {COLOR_TOKENS.map((token) => (
            <div key={token} style={swatchStyle}>
              <div style={{ height: 56, background: `var(${token})` }} />
              <p
                className="hashValue"
                style={{ padding: "6px 8px", margin: 0 }}
              >
                {token}
              </p>
            </div>
          ))}
        </Row>
      </Section>

      <Section title="Type scale">
        {TEXT_TOKENS.map(([token, role]) => (
          <p key={token} style={{ fontSize: `var(${token})`, margin: "8px 0" }}>
            <span className="hashValue" style={{ marginRight: 12 }}>
              {token}
            </span>
            {role}
          </p>
        ))}
        <p style={{ font: "500 var(--display-page) / 1.05 var(--font-serif)" }}>
          --display-page · serif display
        </p>
        <p className="hashValue">--font-mono · 4f1d…hash and error codes</p>
      </Section>

      <Section title="Buttons">
        <Row>
          <button type="button" className="buttonPrimary">
            Primary action
          </button>
          <button type="button" className="buttonSecondary">
            Secondary action
          </button>
          <button type="button" className="buttonPrimary" disabled>
            Disabled primary
          </button>
          <button type="button" className="modalClose">
            Close
          </button>
          <button type="button" className="linkButton">
            Link button (opens drawer)
          </button>
        </Row>
      </Section>

      <Section title="Pills and status">
        <Row>
          <span className="pill">Web capture</span>
          <span className="pill">Unreviewed</span>
          <span className="pill handling-sensitive">SENSITIVE</span>
          <span className="pill handling-restricted">RESTRICTED</span>
          <span className="pill auditOutcome-denied">Denied</span>
          <span className="pill auditOutcome-failure">Failure</span>
          <span className="pill" title="Your role cannot add evidence">
            Read-only register
          </span>
        </Row>
        <div className="handlingBanner handling-sensitive">
          <strong>SENSITIVE</strong> Limit to people with a need to know.
        </div>
      </Section>

      <Section title="Forms">
        <form
          className="stackedForm"
          style={{ maxWidth: 420 }}
          onSubmit={(event) => event.preventDefault()}
        >
          <label htmlFor="ds-input">Text input</label>
          <input id="ds-input" defaultValue="Value" />
          <p className="fieldHint">A hint directly below its control.</p>
          <label htmlFor="ds-select">Select</label>
          <select id="ds-select" defaultValue="b">
            <option value="a">Option A</option>
            <option value="b">Option B</option>
          </select>
          <p className="formError" role="presentation">
            Something failed. This is the error box.
          </p>
          <p className="formSuccess" role="presentation">
            Saved. This is the success box.
          </p>
          <div className="formActions">
            <button type="submit" className="buttonPrimary">
              Save
            </button>
            <button type="button" className="buttonSecondary">
              Cancel
            </button>
          </div>
        </form>
      </Section>

      <Section title="Data table">
        <table className="dataTable">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Status</th>
              <th scope="col">Progress</th>
              <th scope="col">SHA-256</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <button type="button" className="rowLink linkButton">
                  Captured fixture page
                </button>
                <span className="cellSub">web-page-capture</span>
              </td>
              <td>
                <span className="pill">Running</span>
              </td>
              <td>
                <progress max={100} value={60} aria-label="Progress: 60%" />
                <span className="cellSub">Fetching page</span>
              </td>
              <td>
                <span className="hashValue">ff67a9d764d6…</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="loadMoreRow">
          <button type="button" className="buttonSecondary">
            Load more
          </button>
        </div>
      </Section>

      <Section title="Empty state and notes">
        <div className="emptyState" style={{ margin: "0 0 16px" }}>
          <h2>No evidence yet</h2>
          <p>Upload a file or record manual evidence to start the register.</p>
          <button type="button" className="buttonPrimary">
            Upload file
          </button>
        </div>
        <p className="stateNote">Loading evidence…</p>
        <div className="noticeBox">A muted informational notice.</div>
      </Section>

      <Section title="Case tabs">
        <nav className="caseTabs" aria-label="Example sections">
          <span className="caseTab caseTabActive" aria-current="page">
            Sources
          </span>
          <span className="caseTab">Jobs</span>
          <span className="caseTab">Audit</span>
        </nav>
      </Section>

      <Section title="Panel and detail list">
        <div className="panel" style={{ maxWidth: 480 }}>
          <h2>Provenance</h2>
          <dl className="detailList">
            <div>
              <dt>SHA-256</dt>
              <dd className="hashValue">ff67a9d764d6a2367a18…</dd>
            </div>
            <div>
              <dt>Collected</dt>
              <dd>10 June 2026 by Local Owner</dd>
            </div>
          </dl>
        </div>
      </Section>

      <Section title="Modal (rendered inline)">
        <dialog open className="modal" style={{ position: "static" }}>
          <div className="modalHeader">
            <h2>Queue web page capture</h2>
            <button type="button" className="modalClose">
              Close
            </button>
          </div>
          <p className="fieldHint">
            The capture worker fetches a single public page over http(s).
          </p>
        </dialog>
      </Section>

      <Section title="Drawer (un-fixed for display)">
        <aside
          className="drawer"
          style={{ position: "static", width: "min(480px, 100%)" }}
        >
          <div className="drawerHeader">
            <div>
              <p className="eyebrow">Web capture evidence</p>
              <h2>Captured fixture page</h2>
            </div>
            <button type="button" className="modalClose">
              Close
            </button>
          </div>
          <h3 className="drawerSectionTitle">Attempts</h3>
          <ol className="attemptList">
            <li>
              <strong>#1</strong> 10 June 2026 — failed (DNS_FAILURE, retryable)
            </li>
            <li>
              <strong>#2</strong> 10 June 2026 — succeeded
            </li>
          </ol>
          <div className="drawerActions">
            <button type="button" className="buttonPrimary">
              Download original
            </button>
          </div>
        </aside>
      </Section>

      <Section title="Audit timeline">
        <ol className="auditTimeline">
          <li className="auditEvent">
            <div className="auditEventHead">
              <strong>Evidence added</strong>
              <span className="pill">Success</span>
            </div>
            <p className="auditEventMeta">
              Local Owner · evidence · 10 June 2026
            </p>
          </li>
          <li className="auditEvent">
            <div className="auditEventHead">
              <strong>Action denied</strong>
              <span className="pill auditOutcome-denied">Denied</span>
            </div>
            <p className="auditEventMeta">
              viewer@evidara.local · attempted evidence.create
            </p>
          </li>
        </ol>
      </Section>
    </main>
  );
}
