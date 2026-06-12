# Timeline — Interaction Specification

Status: Phase 5 of the [design milestone](../plans/design-milestone.md)  
Prototype: `/prototypes/timeline` (development-only route, 404 in production)  
Requirements: PRD §4 ("Timeline: events, observations, publication dates,
and collection dates"), edge-case policy on time ambiguity, UX rules in
`docs/architecture/ui-architecture.md`

## 1. Purpose and the dual-time model

The timeline answers two different questions that investigators routinely
conflate: *when did things happen* and *when did we (or the world) learn of
them*. Every timeline item carries up to four timestamps:

| Field | Meaning | Always present |
| --- | --- | --- |
| `occurredAt` | Event time — when it happened | Yes |
| `observedAt` | When someone observed it, if distinct | No |
| `publishedAt` | When it was published to an audience | No |
| `collectedAt` | When Evidara collected the evidence | Yes |

The surface has a **primary-axis switch**: Event time (default) or
Collection time. Switching re-positions every item; it is the single most
analytically useful control on the surface (the demo case's tell — rerouting
inquiries spiking *before* any official notice — is only visible on the
event axis, while collection bias is only visible on the collection axis).
The detail panel always lists all four timestamps; divergence between
occurred and published beyond a threshold is called out as a labeled gap
("published 3 days after the event"), since narrative lag is investigative
signal.

Per the edge-case policy, original time text, parsed instant/range,
timezone, and parser confidence are stored separately in the real schema;
the timeline renders the parsed instant and discloses precision (§4).

## 2. Layout

- Horizontal axis, left-to-right chronology, tick density adapting to the
  zoom level (years → months → days).
- Items stack into **lanes** assigned greedily to avoid label collisions;
  lane position carries no meaning (documented on-surface via legend).
- Zoom: preset buttons (All, year, month) plus keyboard `+`/`-`; pan via
  arrow keys and drag. A visible range label always states the current
  window ("March 2026").
- Count line as on the graph: "12 of 30 events in view" — clipped items are
  announced, never silent.
- View toggle: Timeline ⇄ Table (§6), state-preserving.

## 3. Clustering

When more than three items fall within a small pixel window at the current
zoom, they collapse into a **cluster chip** showing the count. Activating a
cluster zooms the window to the cluster's span (drill-down, not popover —
one consistent gesture). Clusters carry an accessible name ("Cluster of 5
events, 3–5 March 2026"). The demo dataset's publication burst around
4 March 2026 exercises this.

## 4. Uncertainty and precision

- Items whose source gave only a date (no time) render as **day-span bars**
  rather than instant dots at midnight — midnight dots fabricate precision.
- Range items (the charter laycan, the alleged claim-filing window) render
  as labeled span bars from start to end.
- The detail panel states precision explicitly ("date only", "exact time",
  "window") next to each timestamp.
- Mixed precision never sorts misleadingly: date-only items order within
  their day by stable id, and the panel says so.

## 5. Selection and detail

- Click or Enter selects an item; the detail drawer shows label, summary,
  the four timestamps with precision, linked entities (each navigates to
  the graph surface with that entity selected — cross-surface selection
  uses the same `?selected=` contract the graph established), and sources
  (one action from every claim to its evidence).
- Selection is URL-reflected (`?selected=<eventId>`); Escape clears.

## 6. Non-visual alternative: the chronology table

The Table view renders the identical filtered window as a real `<table>`:
columns for label, occurred, observed, published, collected (sortable by
any time column), precision, entities, and sources. It is the same surface
with the same selection model — not an export. Screen-reader users get the
table as primary; the lane canvas is `aria-hidden` redundancy at that
point.

## 7. Keyboard model

| Key | Action |
| --- | --- |
| Tab | Enter the timeline; items focus in chronological order |
| ← / → | Previous / next item chronologically |
| Enter / Space | Select focused item or expand focused cluster |
| `+` / `-` | Zoom around the focused item (or window center) |
| Home / End | First / last item in the current window |
| Escape | Clear selection |

## 8. States

Loading, error-with-retry, and two empty states (no events in case; window
excludes everything, with a one-click "Show all") follow the standard
component patterns.

## 9. Data requirements (input to the feature milestone)

- A timeline item is a projection, not a table: it unions ontology EVENT
  entities, evidence collection acts, and (later) observations. The
  feature milestone needs an `Event` record with the four nullable
  timestamps, a precision enum per timestamp, original time text, timezone,
  and entity/evidence links — plus a read API
  (`GET /v1/cases/:caseId/timeline?from&to&axis=occurred|collected`)
  returning the merged projection with cursor pagination.
- Range events need `occurredAt`/`occurredUntil` pairs.
- The graph's §10 entity records supply the linked-entity chips; no new
  entity shape is required.
