# Notebook — Interaction Specification

Status: Phase 6 of the [design milestone](../plans/design-milestone.md)  
Prototype: `/prototypes/notebook` (development-only route, 404 in production)  
Requirements: PRD §4 ("Notebook: structured notes with citation chips that
link back to evidence"), PRD §5 AI constraints, UX rules in
`docs/architecture/ui-architecture.md`

## 1. Purpose

The notebook is where analysis happens in prose: structured notes whose
claims stay attached to their evidence. Its defining feature is the
**citation chip** — an inline, atomic reference to an evidence item that
travels with the text it supports. The notebook is also the primary surface
where AI suggestions appear and get adjudicated, so the PRD's AI
constraints (reviewable, evidence-bound, never auto-accepted) are
interaction design here, not policy abstractions.

The UX rules draw one hard line this surface must keep visible: **source
content, analyst annotation, and system/AI output are three different
things** and must never blur. Quoted evidence renders as evidence, analyst
prose as prose, unaccepted AI text as a clearly foreign object.

## 2. Document model

A note is a versioned JSON document — an ordered list of blocks:

| Block | Content | Notes |
| --- | --- | --- |
| `heading` | text, level 2–3 | Note structure |
| `paragraph` | rich text: plain runs + inline **citation atoms** | The workhorse |
| `evidence-excerpt` | evidenceId + verbatim excerpt range | Block-level quotation of source content; visually distinct from analyst prose; the excerpt is copied *by reference* (offsets into stored evidence text), never a mutable copy |
| `ai-suggestion` | proposed block(s) + provenance | Holding state only; never exported, never citable, removed on accept/reject (§5) |

Rules:

- Citation atoms are **schema-level objects, not text decorations**. An
  editing operation can move or delete a chip whole; it can never split,
  partially select, or corrupt one into plain text.
- The document stores `evidenceId` references only — never copied titles or
  content. Chips render from the live evidence record, so a retitled
  evidence item updates everywhere it is cited.
- Documents are append-versioned: each save creates a new version with
  actor and timestamp; version history is a later surface, but the model
  must support it from the start (analyst notes are part of the
  investigative record).

## 3. Citation chips

- **Anatomy**: kind glyph (the graph taxonomy's evidence category), the
  evidence title (truncated), and — on hover/focus — collection method and
  date. Rendered with the `.pill` recipe at inline size.
- **Behavior**: activating a chip (click or Enter) opens the evidence
  detail drawer — the same provenance panel the source register uses: one
  action from claim to evidence, per the standing UX rule.
- **Insertion**: an "Insert citation" affordance (toolbar button in the
  prototype; `@`-trigger as a later refinement) opens a searchable evidence
  picker scoped to the case. Keyboard-complete: search, arrows, Enter.
- **Integrity states**: a chip whose evidence was excluded from the case
  renders in the danger treatment with an explicit "(excluded)" suffix —
  the citation is preserved (the historical record must not silently lose
  what a claim rested on) but visibly degraded. Deleting evidence is
  already blocked at the schema level for cited items in the feature
  milestone's join table (restrict FK).
- **Reverse lookup** is a first-class requirement: "which notes cite this
  evidence item" powers the evidence panel's future "cited in" section and
  report assembly. The data model (§7) makes citations a join table, not
  text to parse.

## 4. Editing model

Block-based editing, not freeform contenteditable across the document:

- One block is active at a time; the active paragraph edits as text with
  visible chip placeholders; all other blocks render in display mode.
- Enter at block end creates a new paragraph; the toolbar (and later,
  `/`-commands) inserts headings, excerpts, and citations.
- Blocks reorder with explicit controls (move up/down) — drag-and-drop is
  an enhancement, never the only path (keyboard rule).
- Autosave on block blur with the debounce pattern; explicit save is also
  present because analysts must trust that the record is durable.

## 5. AI suggestions

Per PRD §5, AI output is assistive, reviewable, and evidence-bound. On
this surface that means:

- A suggestion arrives as an `ai-suggestion` block rendered in an
  unmistakably distinct treatment: dashed border, "AI suggestion — not
  accepted" label, and a **provenance line** stating model, prompt version,
  evidence-context hash, and timestamp (every element the PRD requires to
  be visible).
- Every claim in a suggestion must carry a citation chip or an explicit
  `inference` badge; a suggestion containing neither is invalid and renders
  with a blocking error instead of an accept button.
- **Accept** converts the proposal into normal blocks, recording
  `derivedFrom: <runId>` lineage on each; the visual distinction disappears
  because the analyst has taken ownership — that is the point of the
  ritual. **Edit-then-accept** is the expected common path.
- **Reject** removes the block and records the decision (optional reason)
  against the AI run — rejection data is product feedback and audit
  material.
- Suggestions never block editing around them, never reorder themselves,
  and expire with their run if the case's evidence context changes
  (stale suggestions are dangerous suggestions).

## 6. Keyboard model

| Key | Context | Action |
| --- | --- | --- |
| Tab / Shift+Tab | Document | Move between blocks and chips |
| Enter | Focused block (display) | Edit block |
| Escape | Editing block | Exit to display mode |
| Enter | Focused chip | Open evidence drawer |
| Alt+↑ / Alt+↓ | Focused block | Move block |
| Enter / Space | Suggestion's Accept/Reject | Adjudicate |

## 7. Data requirements (input to the feature milestone)

- `Note`: id, caseId, title, document (JSON, schema-validated), version,
  createdBy/At, updatedBy/At. Mutations append versions; concurrent edits
  use the existing optimistic-concurrency pattern (version + If-Match).
- `NoteCitation` join: noteId, evidenceId, blockId — written
  transactionally with the document so reverse lookup never drifts from
  document content; restrict FK from evidence.
- AI: `ai-suggestion` blocks reference an `AiRun` id; accept/reject
  decisions write to the run's suggestion records (the AI tables already
  sketched in the schema), with `derivedFrom` lineage on accepted content.
- API: CRUD on `/v1/cases/:caseId/notes` (list/create/read/update with
  If-Match), plus `GET /v1/cases/:caseId/evidence/:id/citations` for
  reverse lookup. All audited as case mutations.

## 8. Editor: build vs adopt (the recommendation)

The notebook is the one surface where a third-party dependency decision is
unavoidable and consequential. Options, with the recommendation first:

1. **Adopt ProseMirror (recommended), most likely via Tiptap for
   ergonomics.** ProseMirror's schema-constrained document model is
   exactly what §2 requires: citation chips as inline atom nodes that
   editing operations cannot corrupt, JSON documents that version and
   validate, and a proven path to collaborative editing (Yjs) when
   multi-analyst cases need it. Costs accepted: a real dependency with a
   real learning curve; if Tiptap is used, care to stay on its MIT core
   and off the paid extensions. This is the industry-standard answer for
   structured documents with custom inline objects.
2. **Adopt Lexical (runner-up).** Meta's MIT editor, React-first, custom
   node support. Younger ecosystem and fewer battle-tested
   collaborative/citation-style examples than ProseMirror; would be the
   choice if the team strongly valued its React idioms over ProseMirror's
   maturity.
3. **Markdown textarea with citation tokens (minimum viable fallback).**
   Plain textarea storing markdown plus `[[evd:id]]` tokens, chips
   rendered only in preview. Nearly free, fully accessible, and honest —
   but chips are not objects while editing (the §2 integrity rule is
   enforced only at parse time), and the editing experience caps out
   quickly. Acceptable only if the feature milestone must cut scope.

**Rejected: building on raw contenteditable.** Selection, IME, undo
history, and paste sanitization are years of edge cases; every mature
editor library exists because teams kept relearning this. The prototype
below deliberately uses a block-based composition of plain controls — it
demonstrates the interaction model without prejudging the library, and it
is throwaway by design.

## 9. States

Standard loading/error/empty patterns; the empty note teaches the first
action ("Write, or insert a citation to start from the evidence"). A
note with unresolved (excluded-evidence) citations shows a count in its
header.
