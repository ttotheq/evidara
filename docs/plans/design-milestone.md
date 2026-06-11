# Design Milestone Delivery Plan

Status: approved 2026-06-10 (decisions in §3 resolved); in implementation  
Milestone: design system and post-slice interaction design  
Decided: 2026-06-10 — a dedicated design milestone runs after the vertical
slice and before any further feature code  
Source requirements: `docs/requirements/evidara-osint-platform-prd.md` (§4
Analyst Views, Phase 0 roadmap items)  
Predecessor: `docs/plans/first-usable-vertical-slice.md` (complete)

## 1. Milestone Outcome

Two products, both inputs to every future feature milestone:

1. **A documented design system.** The de facto visual language in
   `apps/web/app/styles.css` (756 lines, 7 root custom properties, ~40
   component classes) becomes a deliberate token and component system with
   documented usage rules, rendered live in a development-only styleguide,
   with zero visual regression to the shipped slice UI.
2. **Interaction designs for the four post-slice analyst surfaces** — entity
   graph, timeline, map, and notebook — each delivered as a written
   interaction specification plus an in-app prototype on synthetic data,
   detailed enough that the next feature milestone plan can be written
   directly from them.

This milestone produces design artifacts and prototypes. It does not build
the real surfaces, change the API, or alter the database schema (one
exception: a development-only demo seed, §4).

## 2. Definition of Done

- Every color, type size, spacing step, radius, border, and motion value in
  the web app resolves to a named token; no raw hex/px values in component
  rules except where a token is genuinely one-off (documented inline).
- A component catalog documents every reusable piece of the current UI
  (buttons, pills, tables, drawers, modals, stacked forms, filter bars,
  empty/loading/error states, timeline) with usage rules and accessibility
  notes.
- A development-only `/design-system` route renders all tokens and
  components from synthetic props; it is excluded from production
  navigation and crawling.
- Both a dark and a light token set exist; dark is the default; the theme
  preference control persists the choice; both themes pass the WCAG 2.2 AA
  contrast matrix.
- The shipped slice UI is visually unchanged in the default dark theme: the
  existing Playwright suite passes unmodified, and a before/after
  screenshot pass of the seven implemented routes shows parity.
- A synthetic demo case exists behind a dev-only seed flag, with enough
  entities, relations, events, and locations to exercise graph, timeline,
  and map designs realistically.
- Each of graph, timeline, map, and notebook has: a written interaction
  spec (layout, states, selection model, keyboard operation, assistive
  alternatives, data requirements, open API implications) and a clickable
  in-app prototype route on the demo data.
- Every spec satisfies the standing UX rules in
  `docs/architecture/ui-architecture.md` (source/confidence visible in one
  action, AI output visually distinct, WCAG 2.2 AA including non-visual
  alternatives for graph/map/timeline).
- The repository builds, all 225 tests plus the e2e suite pass, lint and
  typecheck are clean at every phase boundary.

## 3. Decisions (resolved 2026-06-10)

### 3.1 Prototype medium — DECIDED: dev-only routes in the real app

Next.js routes under a prototypes group, gated out of production builds.
Prototypes use the real tokens/components so design and implementation
cannot drift, and they become scaffolding for the real surfaces. The cost
accepted: prototype code needs discipline to stay throwaway-cheap and must
not leak into production bundles. (Rejected: static HTML mockups — fork the
CSS and drift immediately; external design tool — unversioned artifacts
with no designer seat on the project.)

### 3.2 Theme scope — DECIDED: both themes, dark by default

Tokens carry both a dark and a light value set, named by role; dark remains
the default and the shipped slice UI must be pixel-identical in dark mode.
A minimal theme preference control ships with the token work, and the
contrast matrix in `docs/design/tokens.md` must pass WCAG 2.2 AA for both
themes. The accepted cost: token validation and the parity surface double.

### 3.3 Graph rendering target — DECIDED: SVG/DOM (design-time assumption)

The graph spec and prototype assume SVG/DOM rendering: honest keyboard and
screen-reader semantics at MVP graph sizes (the PRD's graph is
filter-bounded, not whole-corpus). The spec records the node/edge threshold
at which a canvas/WebGL renderer becomes necessary so the future decision
is pre-framed.

## 4. Implementation Sequence

Each phase leaves the repository building and all tests passing.

### Phase 1: Token foundation

Deliver:

- Inventory of every literal value in `styles.css` (colors, type scale,
  spacing, radii, borders, shadows, motion durations).
- Token set as CSS custom properties, named by role, replacing literals
  throughout; consolidation of near-duplicates (the audit decides each
  case explicitly).
- A light token value set alongside the dark default, plus a minimal theme
  preference control in the application shell (persisted; dark when unset).
- `docs/design/tokens.md`: the token reference — names, values per theme,
  roles, and the contrast matrix for text/background pairs against
  WCAG 2.2 AA in both themes.

Acceptance:

- No visual change in the default dark theme: e2e suite passes unmodified;
  screenshot parity pass on `/login`, `/cases`, `/cases/new`, and the five
  case tabs.
- Stylelint-style guard is not introduced (no new tooling); instead the
  catalog documents the rule "new CSS uses tokens" and review enforces it.

### Phase 2: Component catalog and styleguide

Deliver:

- `docs/design/components.md`: every reusable component with purpose, usage
  rules, states (hover/focus/disabled/busy), and accessibility notes.
- Consolidation of duplicated or near-duplicate component CSS found by the
  audit (e.g., pill/status variants) — markup changes only where parity is
  preserved.
- Development-only `/design-system` route rendering tokens and all
  components from synthetic props; excluded from production.

Acceptance:

- Catalog covers 100% of classes used by implemented routes.
- e2e suite and screenshot parity still pass.

### Phase 3: Synthetic demo dataset

Deliver:

- A typed fixture dataset in the web app (validated against
  `@evidara/ontology` types) describing one clearly fictional demo case:
  synthetic entities drawing from all 16 ontology entity types, typed
  relations covering all 13 relation types, dated events, geocoded
  locations, and evidence stubs with provenance.
- The dataset is design infrastructure consumed only by the prototype
  routes. No database tables, no seed changes, nothing in the production
  app: the schema for entities/relations does not exist yet, and designing
  it here would be scope creep — it is a feature-milestone concern that
  the Phase 4–6 specs' data-requirements sections will inform.

Acceptance:

- Prototypes can render ~50 entities, ~80 relations, ~30 dated events, ~15
  locations without hand-editing.
- Nothing in the production app changes.

### Phase 4: Entity graph interaction design

Deliver:

- `docs/design/graph.md`: canvas layout, entity-type visual taxonomy
  (shape/color/icon per ontology type), relation rendering (direction,
  type, confidence), filters (type, source, confidence, time per PRD §4),
  selection and detail-panel model, evidence/provenance affordance on every
  node and edge, keyboard navigation model, and the non-visual alternative
  (the PRD and UX rules require one — likely a navigable adjacency list).
- Prototype route on the demo dataset exercising select, filter, expand,
  and detail-inspection flows.

Acceptance:

- Spec answers the standing UX rules; prototype is keyboard-operable
  end-to-end; data requirements section is concrete enough to derive the
  entities/relations API and schema in the next milestone.

### Phase 5: Timeline and map interaction design

Deliver:

- `docs/design/timeline.md`: dual-time model (event time vs. observation
  vs. publication vs. collection time — the PRD distinguishes them), zoom
  levels, clustering, uncertainty/range rendering, linkage to evidence.
- `docs/design/map.md`: geocoded entity/event rendering, clustering,
  ambiguity states (geocoding requires analyst confirmation per the edge-
  case policy), and the tabular non-visual alternative.
- Prototype routes for both on the demo dataset.

Acceptance: as Phase 4, per surface.

### Phase 6: Notebook interaction design

Deliver:

- `docs/design/notebook.md`: document model (structured notes), citation
  chips that link back to evidence (the PRD's defining feature for this
  surface), AI-suggestion presentation rules (visually distinct until
  accepted), and the editing interaction model — including the build-vs.-
  adopt question for the editor (a recommendation with trade-offs, since
  an editor dependency is a significant commitment).
- Prototype route demonstrating note composition with citation chips
  against demo evidence.

Acceptance: as Phase 4, plus an explicit editor recommendation.

### Phase 7: Synthesis and next-milestone input

Deliver:

- `docs/design/README.md` tying tokens, components, and the four specs
  together; design-system usage rules for future feature work.
- An ordering recommendation with trade-offs for which surface the next
  feature milestone builds first (the graph is the likely candidate — it
  unlocks the ontology schema that timeline and map also need — but the
  recommendation is made with the finished specs in hand).
- Handoff document updated; milestone closed with the same verification
  gate as previous milestones.

Acceptance:

- A feature-milestone plan for the chosen surface could be written from
  these artifacts without reopening design questions.

## 5. Non-Goals

- No production feature code for graph, timeline, map, or notebook.
- No API or database schema changes; no new entities/relations tables.
- No new heavyweight dependencies (no Storybook, no design-tool pipeline;
  graph/map libraries are evaluated in specs, adopted only in prototypes if
  trivially removable).
- No marketing-page redesign.
- No redesign of shipped slice screens beyond token-parity refactoring.

## 6. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Token refactor silently changes shipped UI | Screenshot parity pass per phase; e2e suite unchanged |
| Prototype code leaks into production | Dev-only routing gate; prototypes import only tokens/components |
| Specs drift from feasibility | Prototypes are required per surface; a spec without a working prototype does not pass its phase |
| Demo data accidentally treated as real schema | Fixtures live in the e2e/prototype layer, not migrations |
| Scope creep into feature building | Non-goals above; each phase's acceptance is artifacts, not features |
| Design decisions made nobody asked for | §3 decisions resolved with Ty before Phase 1 starts |
