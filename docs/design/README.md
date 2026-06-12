# Evidara Design System and Surface Designs

Produced by the [design milestone](../plans/design-milestone.md)
(complete, 2026-06-12). This directory is the design input every future
feature milestone builds from.

## Contents

| Artifact | What it is | Live counterpart |
| --- | --- | --- |
| [tokens.md](tokens.md) | Token reference: dark + light values, WCAG contrast matrix, audit decisions | `:root` blocks in `apps/web/app/styles.css` |
| [components.md](components.md) | Component catalog with usage and accessibility rules | `/design-system` (dev only) |
| [graph.md](graph.md) | Entity graph interaction spec | `/prototypes/graph` (dev only) |
| [timeline.md](timeline.md) | Dual-time chronology interaction spec | `/prototypes/timeline` (dev only) |
| [map.md](map.md) | Geocoded locations interaction spec | `/prototypes/map` (dev only) |
| [notebook.md](notebook.md) | Notes/citations/AI-adjudication interaction spec | `/prototypes/notebook` (dev only) |

The prototypes run on the fictional demo dataset in `apps/web/lib/demo`
("Berth 14 narrative network") and are 404 in production builds.

## Rules for feature work

1. **New CSS uses tokens.** Raw values need an inline justification
   (tokens.md). Both themes must stay AA: re-verify the contrast matrix
   when any color token changes.
2. **Compose from the catalog** before inventing a component; new
   components get a catalog entry in the same change.
3. **Shared surface conventions** — every analyst surface keeps these,
   they are load-bearing across graph/timeline/map/notebook:
   - Selection is URL-reflected (`?selected=<id>`), making views shareable
     and enabling cross-surface navigation (map → graph → timeline).
   - Escape clears selection from anywhere; a second press exits any
     focus/zoom mode.
   - Every canvas surface has an **equivalent** table/list view — the same
     data, filters, and selection, not a summary.
   - Count lines disclose filtering ("31 of 59 entities") — no silent
     truncation, ever.
   - Every claim, node, edge, and chip is one action away from its
     evidence (the provenance drawer).
   - Confidence and precision are stated numerically/verbally wherever
     they are encoded visually — color, opacity, and dash patterns are
     hints, never the record.
4. **The graph category taxonomy** (`apps/web/app/prototypes/graph/taxonomy.ts`)
   is the shared visual vocabulary for entity types across all surfaces;
   promote its colors to `--graph-cat-*` tokens when the first real
   surface ships.
5. **Prototype code is throwaway scaffolding.** Real surfaces re-implement
   against the specs and the real APIs; nothing under `app/prototypes/`
   may be imported by production routes.

## Decisions the feature milestones inherit

- **Graph**: SVG/DOM rendering to ~1,000–1,500 elements, filter-bounded
  views, deterministic layout (graph.md §1–2); entities/relations schema
  and API shape in graph.md §10.
- **Timeline**: the four-timestamp model with per-timestamp precision;
  never fabricate midnight instants (timeline.md §1, §4); Event schema in
  §9.
- **Map**: **self-hosted vector tiles only — no hosted tile APIs**; a tile
  provider would learn every case's geographic areas of interest
  (map.md §2). Geocode records separate from LOCATION entities, audited
  confirm mutation (§9).
- **Notebook**: ProseMirror (likely via Tiptap's MIT core) when the real
  editor is built; citation chips as schema atoms; the AI adjudication
  contract (notebook.md §5, §8).

## What the next feature milestone should build first

Three viable orderings, with the recommendation first:

1. **Graph first (recommended).** The graph forces the entities/relations
   schema, the ontology rule enforcement, the citation join pattern, and
   the entity detail panel into existence — and timeline and map both
   consume that same foundation (their items link entities; their detail
   panels are the graph's panel). Building graph first means timeline and
   map arrive as projections over an existing model rather than inventing
   parallel ones. Cost: it is the largest single surface, and analysts see
   no new value until entities exist — which argues for pairing it with
   the first AI extraction workflow (PRD Phase 1 lists both) so entities
   populate from evidence instead of hand entry.
2. **Notebook first.** Delivers analyst value immediately with only the
   existing evidence model (citations need evidence items, not entities),
   and settles the editor dependency early. Cost: it postpones the
   ontology schema that everything else needs, and its AI-suggestion
   blocks would land before any AI runs exist to produce them.
3. **Timeline first.** Cheapest real surface (one Event table plus a
   projection), exercises the dual-time model early. Cost: without
   entities, timeline items link to nothing, which guts the surface's
   point.

Recommendation: **graph + minimal entity extraction** as the next feature
milestone, then timeline and map as fast followers over the same schema,
then notebook with the editor adoption. Revisit only if analyst feedback
from the slice argues for prose-first work.
