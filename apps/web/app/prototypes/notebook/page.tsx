"use client";

import { notFound } from "next/navigation";
import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import type { DemoEvidence } from "../../../lib/demo";
import { demoDataset } from "../../../lib/demo";
import { ThemeToggle } from "../../../lib/theme";
import { evidenceById } from "../shared";

// Interaction prototype for docs/design/notebook.md. Development-only.
// Deliberately built from plain controls (textarea + token round-trip, the
// spec's §8 fallback behavior) so it demonstrates the interaction model
// without prejudging the editor library; in the real surface, citation
// chips are schema-level atoms (ProseMirror recommendation, notebook.md §8).

interface TextSegment {
  kind: "text";
  text: string;
}
interface CitationSegment {
  kind: "citation";
  evidenceId: string;
}
type Segment = TextSegment | CitationSegment;

interface HeadingBlock {
  id: string;
  kind: "heading";
  text: string;
}
interface ParagraphBlock {
  id: string;
  kind: "paragraph";
  segments: Segment[];
  derivedFrom?: string;
}
interface ExcerptBlock {
  id: string;
  kind: "excerpt";
  evidenceId: string;
}
interface SuggestionBlock {
  id: string;
  kind: "suggestion";
  text: string;
  citationIds: string[];
  provenance: {
    model: string;
    promptVersion: string;
    contextHash: string;
    at: string;
  };
}
type Block = HeadingBlock | ParagraphBlock | ExcerptBlock | SuggestionBlock;

const KIND_GLYPHS: Record<DemoEvidence["kind"], string> = {
  WEB_CAPTURE: "W",
  FILE: "F",
  MANUAL: "M",
};

function segmentsToTokens(segments: Segment[]): string {
  return segments
    .map((segment) =>
      segment.kind === "text" ? segment.text : `[[${segment.evidenceId}]]`,
    )
    .join("");
}

function tokensToSegments(raw: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /\[\[(evd-\d{2})\]\]/g;
  let cursor = 0;
  for (const match of raw.matchAll(pattern)) {
    if (match.index > cursor) {
      segments.push({ kind: "text", text: raw.slice(cursor, match.index) });
    }
    const id = match[1];
    if (id && evidenceById.has(id)) {
      segments.push({ kind: "citation", evidenceId: id });
    } else {
      segments.push({ kind: "text", text: match[0] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < raw.length) {
    segments.push({ kind: "text", text: raw.slice(cursor) });
  }
  return segments.length > 0 ? segments : [{ kind: "text", text: "" }];
}

const INITIAL_BLOCKS: Block[] = [
  {
    id: "blk-1",
    kind: "heading",
    text: "Working notes — Berth 14 narrative network",
  },
  {
    id: "blk-2",
    kind: "paragraph",
    segments: [
      {
        kind: "text",
        text: "The spill claim originates from a single lookalike outlet ",
      },
      { kind: "citation", evidenceId: "evd-01" },
      {
        kind: "text",
        text: " and is directly contradicted by the port authority ",
      },
      { kind: "citation", evidenceId: "evd-06" },
      { kind: "text", text: "." },
    ],
  },
  { id: "blk-3", kind: "excerpt", evidenceId: "evd-06" },
  {
    id: "blk-4",
    kind: "paragraph",
    segments: [
      {
        kind: "text",
        text: "Corporate chain: Baltex owns Meridian per the registry extract ",
      },
      { kind: "citation", evidenceId: "evd-04" },
      {
        kind: "text",
        text: ". The shared hosting between the corporate and media domains remains the weakest link in the attribution.",
      },
    ],
  },
  {
    id: "blk-5",
    kind: "suggestion",
    text: "The ownership claim is corroborated independently: the charter party names Meridian as charterer and the fleet page asserts management of the same vessel.",
    citationIds: ["evd-05", "evd-09"],
    provenance: {
      model: "local/extractor-demo",
      promptVersion: "link-suggest@3",
      contextHash: "9b1f02ac44d1",
      at: "2026-03-16T10:00:00Z",
    },
  },
  {
    id: "blk-6",
    kind: "suggestion",
    text: "The network is likely state-directed.",
    citationIds: [],
    provenance: {
      model: "local/extractor-demo",
      promptVersion: "summary@1",
      contextHash: "77ad30c19e02",
      at: "2026-03-16T10:02:00Z",
    },
  },
];

function CitationChip({
  evidenceId,
  onOpen,
}: {
  evidenceId: string;
  onOpen: (id: string) => void;
}) {
  const item = evidenceById.get(evidenceId);
  if (!item) return null;
  const title =
    item.title.length > 34 ? `${item.title.slice(0, 33)}…` : item.title;
  return (
    <button
      type="button"
      className="pill"
      style={{ cursor: "pointer", padding: "2px 9px", margin: "0 2px" }}
      aria-label={`Citation: ${item.title}, ${item.method}, ${new Date(item.collectedAt).toLocaleDateString()}`}
      title={`${item.method} · ${new Date(item.collectedAt).toLocaleDateString()}`}
      onClick={() => onOpen(evidenceId)}
    >
      <strong style={{ marginRight: 5 }}>{KIND_GLYPHS[item.kind]}</strong>
      {title}
    </button>
  );
}

function EvidencePicker({
  onPick,
  onClose,
}: {
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const matches = demoDataset.evidence.filter((item) =>
    item.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <dialog
      open
      className="modal"
      style={{ zIndex: 40, position: "fixed", inset: 0, margin: "auto" }}
    >
      <div className="modalHeader">
        <h2>Insert citation</h2>
        <button type="button" className="modalClose" onClick={onClose}>
          Close
        </button>
      </div>
      <label className="srOnly" htmlFor={inputId}>
        Search evidence
      </label>
      <input
        id={inputId}
        type="search"
        placeholder="Search evidence…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{ marginTop: 12 }}
      />
      <ul
        className="attemptList"
        style={{ marginTop: 12, maxHeight: 280, overflowY: "auto" }}
      >
        {matches.map((item) => (
          <li key={item.id} style={{ marginBottom: 6 }}>
            <button
              type="button"
              className="linkButton"
              style={{ textDecoration: "underline" }}
              onClick={() => onPick(item.id)}
            >
              [{KIND_GLYPHS[item.kind]}] {item.title}
            </button>
          </li>
        ))}
        {matches.length === 0 ? <li>No evidence matches.</li> : null}
      </ul>
    </dialog>
  );
}

function BlockShell({
  label,
  onMoveUp,
  onMoveDown,
  onEdit,
  onKeyDown,
  children,
}: {
  label: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "6px 8px",
        borderRadius: "var(--radius-control)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {onEdit ? (
          <button
            type="button"
            className="modalClose"
            aria-label={`Edit ${label}`}
            onClick={onEdit}
          >
            Edit
          </button>
        ) : null}
        <button
          type="button"
          className="modalClose"
          aria-label={`Move ${label} up`}
          onClick={onMoveUp}
        >
          ↑
        </button>
        <button
          type="button"
          className="modalClose"
          aria-label={`Move ${label} down`}
          onClick={onMoveDown}
        >
          ↓
        </button>
      </div>
    </div>
  );
}

export default function NotebookPrototypePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <NotebookPrototype />;
}

function NotebookPrototype() {
  const [blocks, setBlocks] = useState<Block[]>(INITIAL_BLOCKS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<"closed" | "inline" | "excerpt">(
    "closed",
  );
  const [drawerEvidenceId, setDrawerEvidenceId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const blockCounter = useRef(100);

  function update(id: string, updater: (block: Block) => Block) {
    setBlocks((previous) =>
      previous.map((block) => (block.id === id ? updater(block) : block)),
    );
  }

  function move(id: string, direction: -1 | 1) {
    setBlocks((previous) => {
      const index = previous.findIndex((block) => block.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= previous.length) {
        return previous;
      }
      const next = [...previous];
      const [item] = next.splice(index, 1);
      if (item) next.splice(target, 0, item);
      return next;
    });
  }

  function startEdit(block: ParagraphBlock | HeadingBlock) {
    setEditingId(block.id);
    setDraft(
      block.kind === "heading" ? block.text : segmentsToTokens(block.segments),
    );
  }

  function commitEdit() {
    if (!editingId) return;
    const id = editingId;
    update(id, (block) => {
      if (block.kind === "heading") return { ...block, text: draft.trim() };
      if (block.kind === "paragraph") {
        return { ...block, segments: tokensToSegments(draft) };
      }
      return block;
    });
    setEditingId(null);
    setStatusLine("Saved.");
  }

  function insertCitationAtCursor(evidenceId: string) {
    const textarea = textareaRef.current;
    const token = `[[${evidenceId}]]`;
    if (!textarea) {
      setDraft((previous) => previous + token);
      return;
    }
    const start = textarea.selectionStart ?? draft.length;
    const end = textarea.selectionEnd ?? start;
    setDraft(
      (previous) => previous.slice(0, start) + token + previous.slice(end),
    );
  }

  function addBlock(kind: "paragraph" | "heading") {
    blockCounter.current += 1;
    const id = `blk-${blockCounter.current}`;
    const block: Block =
      kind === "heading"
        ? { id, kind: "heading", text: "New heading" }
        : { id, kind: "paragraph", segments: [{ kind: "text", text: "" }] };
    setBlocks((previous) => [...previous, block]);
    setEditingId(id);
    setDraft(kind === "heading" ? "New heading" : "");
  }

  function addExcerpt(evidenceId: string) {
    blockCounter.current += 1;
    setBlocks((previous) => [
      ...previous,
      { id: `blk-${blockCounter.current}`, kind: "excerpt", evidenceId },
    ]);
  }

  function acceptSuggestion(block: SuggestionBlock) {
    update(block.id, () => ({
      id: block.id,
      kind: "paragraph",
      segments: [
        { kind: "text", text: `${block.text} ` },
        ...block.citationIds.map(
          (evidenceId): Segment => ({ kind: "citation", evidenceId }),
        ),
      ],
      derivedFrom: `${block.provenance.model} · ${block.provenance.promptVersion}`,
    }));
    setStatusLine("Suggestion accepted; lineage recorded on the paragraph.");
  }

  function rejectSuggestion(id: string) {
    setBlocks((previous) => previous.filter((block) => block.id !== id));
    setRejectingId(null);
    setStatusLine(
      rejectReason.trim()
        ? `Suggestion rejected — reason recorded: "${rejectReason.trim()}"`
        : "Suggestion rejected — decision recorded against the AI run.",
    );
    setRejectReason("");
  }

  function blockKey(event: KeyboardEvent<HTMLDivElement>, block: Block) {
    if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      move(block.id, -1);
    } else if (event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      move(block.id, 1);
    } else if (
      event.key === "Enter" &&
      event.target === event.currentTarget &&
      (block.kind === "paragraph" || block.kind === "heading")
    ) {
      event.preventDefault();
      startEdit(block);
    }
  }

  const drawerEvidence = drawerEvidenceId
    ? evidenceById.get(drawerEvidenceId)
    : undefined;

  return (
    <main className="page pageNarrow" style={{ overflow: "visible" }}>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Prototype — design milestone phase 6</p>
          <h1 className="pageTitle">Notebook</h1>
          <p className="pageLede">
            Structured notes with citation chips against the demo evidence.
            Specification: docs/design/notebook.md. Development only; edits are
            in-memory.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="filterBar" style={{ flexWrap: "wrap" }}>
        <button
          type="button"
          className="buttonSecondary"
          onClick={() => addBlock("paragraph")}
        >
          Add paragraph
        </button>
        <button
          type="button"
          className="buttonSecondary"
          onClick={() => addBlock("heading")}
        >
          Add heading
        </button>
        <button
          type="button"
          className="buttonSecondary"
          onClick={() => setPicker("excerpt")}
        >
          Add evidence excerpt
        </button>
        <button
          type="button"
          className="buttonSecondary"
          onClick={() => setBlocks(INITIAL_BLOCKS)}
        >
          Reset demo note
        </button>
      </div>

      <p className="stateNote" aria-live="polite" style={{ padding: "4px 0" }}>
        {statusLine ?? "Focused block: Enter edits, Alt+arrows move."}
      </p>

      <article aria-label="Note document">
        {blocks.map((block) => {
          if (block.kind === "heading") {
            return (
              <BlockShell
                key={block.id}
                label="heading block"
                onMoveUp={() => move(block.id, -1)}
                onMoveDown={() => move(block.id, 1)}
                onEdit={() => startEdit(block)}
                onKeyDown={(event) => blockKey(event, block)}
              >
                {editingId === block.id ? (
                  <input
                    // biome-ignore lint/a11y/noAutofocus: edit mode is entered by explicit user action; focus follows intent
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(event) => {
                      if (event.key === "Escape" || event.key === "Enter") {
                        event.preventDefault();
                        commitEdit();
                      }
                    }}
                  />
                ) : (
                  <h2 style={{ margin: "6px 0" }}>{block.text}</h2>
                )}
              </BlockShell>
            );
          }

          if (block.kind === "paragraph") {
            return (
              <BlockShell
                key={block.id}
                label="paragraph block"
                onMoveUp={() => move(block.id, -1)}
                onMoveDown={() => move(block.id, 1)}
                onEdit={() => startEdit(block)}
                onKeyDown={(event) => blockKey(event, block)}
              >
                {editingId === block.id ? (
                  <div>
                    <textarea
                      ref={textareaRef}
                      // biome-ignore lint/a11y/noAutofocus: edit mode is entered by explicit user action; focus follows intent
                      autoFocus
                      rows={4}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          commitEdit();
                        }
                      }}
                    />
                    <div className="formActions" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="buttonSecondary"
                        onClick={() => setPicker("inline")}
                      >
                        Insert citation
                      </button>
                      <button
                        type="button"
                        className="buttonPrimary"
                        onClick={commitEdit}
                      >
                        Done
                      </button>
                    </div>
                    <p className="fieldHint">
                      Citations appear as [[evd-NN]] tokens while editing; the
                      real editor keeps them as uncorruptible chips (notebook.md
                      §8).
                    </p>
                  </div>
                ) : (
                  <div>
                    <p style={{ margin: "4px 0", lineHeight: 1.9 }}>
                      {block.segments.map((segment, index) =>
                        segment.kind === "text" ? (
                          // biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity; order is the identity
                          <span key={index}>{segment.text}</span>
                        ) : (
                          <CitationChip
                            // biome-ignore lint/suspicious/noArrayIndexKey: same citation may appear twice
                            key={index}
                            evidenceId={segment.evidenceId}
                            onOpen={setDrawerEvidenceId}
                          />
                        ),
                      )}
                    </p>
                    {block.derivedFrom ? (
                      <p className="fieldHint" style={{ marginTop: 2 }}>
                        Derived from accepted AI suggestion ·{" "}
                        {block.derivedFrom}
                      </p>
                    ) : null}
                  </div>
                )}
              </BlockShell>
            );
          }

          if (block.kind === "excerpt") {
            const item = evidenceById.get(block.evidenceId);
            return (
              <BlockShell
                key={block.id}
                label="evidence excerpt block"
                onMoveUp={() => move(block.id, -1)}
                onMoveDown={() => move(block.id, 1)}
                onKeyDown={(event) => blockKey(event, block)}
              >
                <blockquote
                  style={{
                    margin: "4px 0",
                    padding: "10px 14px",
                    borderLeft: "3px solid var(--accent)",
                    background: "var(--panel)",
                    borderRadius: "var(--radius-control)",
                  }}
                >
                  <p className="fieldHint" style={{ margin: "0 0 6px" }}>
                    Evidence excerpt — source content, not analyst prose
                  </p>
                  <p style={{ margin: 0 }}>“{item?.excerpt}”</p>
                  <p style={{ margin: "8px 0 0" }}>
                    <CitationChip
                      evidenceId={block.evidenceId}
                      onOpen={setDrawerEvidenceId}
                    />
                  </p>
                </blockquote>
              </BlockShell>
            );
          }

          const invalid = block.citationIds.length === 0;
          return (
            <BlockShell
              key={block.id}
              label="AI suggestion block"
              onMoveUp={() => move(block.id, -1)}
              onMoveDown={() => move(block.id, 1)}
              onKeyDown={(event) => blockKey(event, block)}
            >
              <div
                style={{
                  border: "1.5px dashed var(--warning-border)",
                  borderRadius: "var(--radius-control)",
                  padding: "10px 14px",
                }}
              >
                <p
                  className="fieldHint"
                  style={{ margin: "0 0 6px", fontWeight: 700 }}
                >
                  AI suggestion — not accepted
                </p>
                <p style={{ margin: "0 0 8px" }}>
                  {block.text}{" "}
                  {block.citationIds.map((id) => (
                    <CitationChip
                      key={id}
                      evidenceId={id}
                      onOpen={setDrawerEvidenceId}
                    />
                  ))}
                </p>
                <p className="fieldHint" style={{ margin: "0 0 10px" }}>
                  {block.provenance.model} · prompt{" "}
                  {block.provenance.promptVersion} · context{" "}
                  {block.provenance.contextHash} ·{" "}
                  {new Date(block.provenance.at).toLocaleString()}
                </p>
                {invalid ? (
                  <p className="formError" role="presentation">
                    No citations and no inference label — this suggestion cannot
                    be accepted (PRD AI constraint).
                  </p>
                ) : null}
                {rejectingId === block.id ? (
                  <div>
                    <label htmlFor={`reject-${block.id}`}>
                      Rejection reason (optional)
                    </label>
                    <textarea
                      id={`reject-${block.id}`}
                      rows={2}
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                    />
                    <div className="formActions" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="buttonPrimary"
                        onClick={() => rejectSuggestion(block.id)}
                      >
                        Confirm reject
                      </button>
                      <button
                        type="button"
                        className="buttonSecondary"
                        onClick={() => setRejectingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="formActions" style={{ marginTop: 4 }}>
                    {!invalid ? (
                      <button
                        type="button"
                        className="buttonPrimary"
                        onClick={() => acceptSuggestion(block)}
                      >
                        Accept
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="buttonSecondary"
                      onClick={() => setRejectingId(block.id)}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </BlockShell>
          );
        })}
      </article>

      {picker !== "closed" ? (
        <EvidencePicker
          onPick={(id) => {
            if (picker === "inline") insertCitationAtCursor(id);
            else addExcerpt(id);
            setPicker("closed");
          }}
          onClose={() => setPicker("closed")}
        />
      ) : null}

      {drawerEvidence ? (
        <aside className="drawer" role="dialog" aria-label="Evidence details">
          <div className="drawerHeader">
            <div>
              <p className="eyebrow">Cited evidence</p>
              <h2>{drawerEvidence.title}</h2>
            </div>
            <button
              type="button"
              className="modalClose"
              onClick={() => setDrawerEvidenceId(null)}
            >
              Close
            </button>
          </div>
          <dl className="detailList">
            <div>
              <dt>Method</dt>
              <dd>{drawerEvidence.method}</dd>
            </div>
            <div>
              <dt>Collected</dt>
              <dd>
                {new Date(drawerEvidence.collectedAt).toLocaleString()} by{" "}
                {drawerEvidence.collectedBy}
              </dd>
            </div>
            {drawerEvidence.sourceUrl ? (
              <div>
                <dt>Source URL</dt>
                <dd className="hashValue">{drawerEvidence.sourceUrl}</dd>
              </div>
            ) : null}
            <div>
              <dt>SHA-256</dt>
              <dd className="hashValue">{drawerEvidence.sha256}</dd>
            </div>
            <div>
              <dt>Excerpt</dt>
              <dd>“{drawerEvidence.excerpt}”</dd>
            </div>
          </dl>
        </aside>
      ) : null}
    </main>
  );
}
