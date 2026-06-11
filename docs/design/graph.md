# Entity Graph — Interaction Specification

Status: Phase 4 of the [design milestone](../plans/design-milestone.md)  
Prototype: `/prototypes/graph` (development-only route, 404 in production)  
Requirements: PRD §4 Analyst Views ("Graph: entities and relationships,
filters by type, source, confidence, and time"), ontology in
`packages/ontology`, UX rules in `docs/architecture/ui-architecture.md`

## 1. Purpose and altitude

The graph answers "what is connected to what, and on whose evidence?" It is
a reading and navigation surface, not a drawing tool: analysts select,
filter, focus, and inspect; creating entities and relations happens through
forms and (later) accepted AI suggestions, not by direct manipulation on
the canvas.

Rendering assumption (decided in plan §3.3): SVG/DOM. Every node and edge
is a real focusable element with real accessibility semantics. The recorded
threshold: SVG handles the MVP's filter-bounded views comfortably to roughly
1,000–1,500 rendered elements (nodes + edges + labels); beyond that,
interaction latency degrades and a canvas/WebGL renderer with a parallel
accessibility tree becomes necessary. The filter model below exists partly
to keep working views under that threshold; the renderer decision should be
revisited only when real cases exceed it.

## 2. Layout

- **Canvas region** fills the case workspace content area; pan by drag on
  empty canvas, zoom by controls (buttons and keyboard, not scroll-jacking).
- **Filter rail** (left or top, per available width): entity-type category
  toggles, minimum-confidence slider, source selector, time window, text
  search.
- **Detail panel** (right drawer, the existing `.drawer` component): opens
  on node or edge selection; never covers the filter rail.
- **View toggle**: Graph ⇄ List (the non-visual alternative, §8) with state
  preserved between toggles — same filters, same selection.
- Layout algorithm: force-directed with deterministic seeding — the same
  case renders the same layout every time (analysts build spatial memory;
  a layout that reshuffles per visit destroys it). Manual node pinning is a
  future enhancement, not MVP.

## 3. Visual taxonomy

Sixteen ontology entity types are too many to discriminate by shape alone.
Types group into seven categories; **category** is encoded by color and
shape, **type** by a glyph and the detail panel. Category colors are
mid-tone values legible as fills against both theme backgrounds; node
labels always render in `--ink` outside the shape, so fills carry no text
contrast requirement.

| Category | Types | Shape | Glyph | Color (both themes) |
| --- | --- | --- | --- | --- |
| People | PERSON | Circle | P | `#e0a458` |
| Organizations | ORGANIZATION | Square | O | `#7fb3e0` |
| Infrastructure | DOMAIN, IP_ADDRESS, URL, EMAIL, PHONE_NUMBER, ACCOUNT | Diamond | D/IP/U/@/T/A | `#9a8fe8` |
| Content | DOCUMENT, IMAGE | Document (notched square) | F/IM | `#6ec9b8` |
| Assertions | CLAIM | Hexagon | C | `#e08585` |
| Places and events | LOCATION, EVENT | Pin (triangle) | L/E | `#a3c66f` |
| Evidence and sources | SOURCE, EVIDENCE_ITEM | Shield (pentagon) | S/EV | `#b9b3a4` |

These seven colors are proposed `--graph-cat-*` tokens; they live in the
prototype until the feature milestone promotes them into `styles.css`.

**Confidence** is encoded by fill opacity (1.0 at confidence ≥ 0.9 stepping
down to 0.35 at ≤ 0.3) *and* stated numerically in the label tooltip and
detail panel — opacity alone is a hint, never the record (no color-only /
opacity-only meaning).

**Handling level** does not render on the canvas. RESTRICTED entities
appear only to users whose case role already grants them; the graph never
becomes a side channel.

## 4. Relation rendering

- Edges are 1.5px lines in `--muted` at 0.6 opacity; selected or
  neighbor-of-selected edges render in `--accent` at full opacity.
- **Direction**: arrowhead at the target end. Symmetric relations
  (AFFILIATED_WITH, LINKED_TO, CONTRADICTS) render without arrowheads.
- **Type**: edge label (`--text-xs`, `--muted`) drawn only when the edge's
  endpoints are selected or hovered, or when total visible edges ≤ 30 —
  permanent labels at scale are noise.
- **Confidence**: dash pattern — solid ≥ 0.7, dashed 0.4–0.7, dotted
  < 0.4 — plus the numeric value in the detail panel.
- CONTRADICTS edges additionally use `--danger-accent` color: contradiction
  is the one relation an analyst must never miss. Color is paired with the
  type label (not color-only).
- Parallel edges between the same pair curve apart; self-relations are not
  in the ontology.

## 5. Filters

All filters compose with AND semantics; each shows its active state and a
one-click clear. Filtering hides; it never deletes.

| Filter | Control | Behavior |
| --- | --- | --- |
| Entity category | Toggle chips (7) | Hiding a category hides its nodes and any edge with a hidden endpoint |
| Minimum confidence | Slider 0–1, step 0.05 | Applies to entities; edges below the threshold render but dotted |
| Source | Select (evidence items) | Shows only entities/relations citing the selected evidence |
| Time window | From/to date inputs | Filters by `firstObserved` (entities) and the relation's earliest source collection date |
| Text search | Search input | Case-insensitive match on label; matching nodes highlight, non-matching dim to 0.2 opacity (dim, not hide — search is for finding, not filtering) |

An always-visible count line states what the view shows: "31 of 59
entities, 44 of 80 relations" — filtered-out volume must be visible (no
silent truncation).

## 6. Selection and detail

- Click (or Enter on a focused node) selects; selection highlights the
  node, its edges, and direct neighbors; everything else dims to 0.35.
- The detail panel (drawer) shows: label, type + category, confidence
  (numeric), summary, attributes, **sources** (every citing evidence stub —
  title, method, collection time — each one action away from the evidence
  record: the PRD's "source and confidence in one action" rule), and the
  relation list grouped by type with per-relation confidence and sources.
- Edge selection shows: relation type, direction, confidence, note, and
  sources.
- **Focus mode**: from a selected node, "Focus on neighborhood" filters the
  canvas to the ego network (selected node + direct neighbors). A second
  invocation from a node inside focus mode re-centers on that node
  (incremental exploration). "Show all" exits. Focus state composes with
  the §5 filters.
- Escape closes the panel and clears selection. Selection state is
  reflected in the URL (`?selected=<entityId>`) so views are shareable and
  the back button works.

## 7. Keyboard model

| Key | Context | Action |
| --- | --- | --- |
| Tab / Shift+Tab | Canvas | Move focus across visible nodes (document order = layout order, stable) |
| Enter / Space | Focused node or edge | Select; open detail panel |
| Escape | Anywhere | Close panel, clear selection; second press exits focus mode |
| `[` / `]` | Selected node | Step focus through the selected node's neighbors |
| `+` / `-` | Canvas | Zoom |
| Arrow keys | Canvas (no selection) | Pan |

Every node is a focusable SVG element with `role="button"` and an
accessible name of the form "Daria Volkonsky, person, confidence 0.75,
5 relations". Focus is always visible (the global 2px accent focus ring).

## 8. Non-visual alternative: the connections list

The List view renders the identical filtered dataset as semantic HTML — it
is the same surface, not a degraded export:

- Entities grouped by category (`<section>` per category, headed), each
  entity a disclosure (`<details>`) whose summary is the accessible name
  from §7.
- Expanding an entity lists its relations: "OPERATES → lanternmedia.example
  (domain), confidence 0.9, 1 source" — each target a link that moves
  selection to that entity (the keyboard equivalent of edge traversal).
- Sources render as nested lists under each entity and relation.
- Filters, search, selection, and the URL parameter behave identically in
  both views; the toggle never loses state.

Screen-reader and keyboard users get the list as the primary surface;
the PRD's "non-visual alternatives for graph content" requirement is
satisfied by equivalence, not by a summary.

## 9. States

- **Loading**: `.stateNote` with `aria-live="polite"`.
- **Empty (no entities in case)**: `.emptyState` teaching the next action
  ("Entities appear here when evidence is processed or added manually").
- **Empty (filters exclude everything)**: distinct copy + one-click "Clear
  filters".
- **Error**: `.stateNote` with retry button (existing pattern).
- **Too large** (beyond the §1 threshold): the view refuses to render the
  full graph and asks for a narrower filter, stating the counts — honest
  refusal beats a frozen tab.

## 10. Data requirements (input to the feature milestone)

The prototype consumes `apps/web/lib/demo`; the real surface needs:

- **Entity record**: id, caseId, type (ontology enum), label, summary,
  confidence, handlingLevel, attributes (typed per entity type),
  firstObserved, createdBy/At, modifiedBy/At, and source citations
  (entity↔evidence join with at least one row enforced — the PRD requires
  every entity to carry a source reference).
- **Relation record**: id, caseId, type (ontology enum), fromEntityId,
  toEntityId, confidence, note, source citations (same join rule), plus
  endpoint-type validation against `ontologyRules` at write time.
- **API shape**: `GET /v1/cases/:caseId/entities` and
  `/relations` with cursor pagination and the §5 filters as query
  parameters; a `GET /v1/cases/:caseId/entities/:entityId/neighborhood`
  (depth 1) powering focus mode and expand-on-demand so the client never
  needs the whole graph; counts endpoints for the §5 count line.
- **Authorization**: all reads case-scoped through the existing policy
  service; RESTRICTED handling filtering happens server-side.
- Merge history, manual layout pinning, and AI-suggested relations are
  explicitly out of MVP graph scope (PRD lists merge as reversible — the
  schema should reserve a merge-history table, but the graph UI for it is
  later).

## 11. Open questions carried to the feature milestone

- Edge bundling or aggregation once a single pair of hubs accumulates
  dozens of parallel relations (not exercised by the demo dataset).
- Whether focus mode should support depth 2 (neighbors-of-neighbors) —
  deferred until real cases show the need.
- Saved graph views (filter + selection presets) — likely wanted with
  saved searches.
