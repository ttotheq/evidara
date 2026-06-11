const capabilities = [
  [
    "Source register",
    "Captured evidence, hashes, provenance, and review state.",
  ],
  ["Entity graph", "People, organizations, infrastructure, claims, and links."],
  [
    "Timeline",
    "Observation, publication, collection, and event time in context.",
  ],
  [
    "Notebook",
    "Analysis with citations that stay attached to source evidence.",
  ],
  ["AI review queue", "Evidence-bound suggestions awaiting analyst decisions."],
  [
    "Report builder",
    "Defensible findings with methodology and an evidence appendix.",
  ],
];

export default function HomePage() {
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brandMark">E</span>
          Evidara
        </a>
        <span className="status">Local workspace</span>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">Open intelligence workspace</p>
          <h1>Build conclusions people can verify.</h1>
          <p className="lede">
            Collect public evidence, preserve its provenance, connect the facts,
            and publish source-linked investigations from one accountable
            workspace.
          </p>
          <div className="actions">
            <a className="buttonPrimary" href="/cases">
              Open the workspace
            </a>
            <a href="/docs">Read the methodology</a>
          </div>
        </div>
        <aside className="caseCard" aria-label="Example case summary">
          <div className="caseHeader">
            <span>CASE-0142</span>
            <span className="pill">Internal</span>
          </div>
          <h2>Public procurement network</h2>
          <dl>
            <div>
              <dt>Evidence</dt>
              <dd>184</dd>
            </div>
            <div>
              <dt>Entities</dt>
              <dd>63</dd>
            </div>
            <div>
              <dt>Reviewed</dt>
              <dd>78%</dd>
            </div>
          </dl>
          <div className="confidence">
            <span>Source coverage</span>
            <div>
              <i />
            </div>
          </div>
        </aside>
      </section>

      <section className="capabilities" aria-labelledby="capabilities-title">
        <p className="eyebrow">Investigation flow</p>
        <h2 id="capabilities-title">One chain from source to finding.</h2>
        <div className="grid">
          {capabilities.map(([title, description], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
