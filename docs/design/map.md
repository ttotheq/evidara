# Map — Interaction Specification

Status: Phase 5 of the [design milestone](../plans/design-milestone.md)  
Prototype: `/prototypes/map` (development-only route, 404 in production)  
Requirements: PRD §4 ("Map: geocoded locations and event clusters"),
edge-case policy on geocoding ambiguity, UX rules in
`docs/architecture/ui-architecture.md`

## 1. Purpose

The map answers "where" — geocoded entities and events for a case. Like the
graph, it is a reading surface: analysts inspect, filter, and confirm; they
do not draw.

## 2. Basemap constraint

The prototype renders markers over a graticule on a plain projection with
**no tile basemap**, because prototypes must not call external services and
the repository takes no map dependency before the feature milestone decides
one. The real surface needs a basemap, and the project's no-external-SaaS
constraint for core local operation applies: the recommendation is a
**self-hostable vector tile set** (e.g., Protomaps single-file PMTiles or a
self-hosted OpenMapTiles server) bundled or fetched at deployment time —
never a hosted tile API key as the default path. Offline operation is a
feature, not a degradation: investigations into sensitive subjects must not
leak their geographic areas of interest to a tile provider, which is also
why the application proxies or self-hosts tiles even when online. This is
the single most important decision the feature milestone inherits from this
spec.

## 3. Markers, precision, and ambiguity

- Markers reuse the graph's category taxonomy where a location's linked
  entities give it a category; locations without entity links use the
  places color. The marker glyph is the place pin; linked-entity count
  renders as a badge.
- **Precision** is visual and stated: `exact` renders a solid pin;
  `city` renders a pin inside a solid radius circle; `region` renders a
  larger dashed radius circle. The panel states the precision word.
- **Unconfirmed geocodes** (the edge-case policy: geocoding ambiguity
  requires analyst selection before a location becomes an accepted fact)
  render with a dashed outline and an explicit "(unconfirmed)" suffix in
  their accessible name; the count line reports them ("15 locations, 6
  with unconfirmed geocodes"); the detail panel carries a visible
  unconfirmed notice. Confirming a geocode is an analyst action that the
  feature milestone wires to a real mutation; the prototype shows the
  affordance disabled with an explanatory hint.
- Sensitive-source protection: locations attached to RESTRICTED-handling
  entities follow the same server-side filtering as the graph; a map must
  never become the side channel that exposes a protected source's
  whereabouts (the demo's protected-interview location stands in for this
  case).

## 4. Clustering

Markers within a screen-distance threshold collapse to a count chip placed
at their centroid; activating a cluster zooms to its bounding box. Cluster
accessible names list the count and area ("Cluster of 3 locations near
Valenport"). Clustering recomputes per zoom level; single markers never
cluster with themselves.

## 5. Selection and detail

Click or Enter selects a marker or cluster. The drawer shows: label,
coordinates (degrees, 3 decimal places), precision, confirmation state,
the entities at the location (links into the graph surface via the shared
`?selected=` contract), the events at the location (links into the
timeline), and sources. Selection is URL-reflected; Escape clears.

## 6. Non-visual alternative: the locations table

The Table view lists the same filtered locations: label, coordinates,
precision, confirmed state, linked entities, linked events, sources —
sortable, selectable, same URL contract. As with graph and timeline, it is
the equivalent surface, not a summary.

## 7. Keyboard model

| Key | Action |
| --- | --- |
| Tab | Markers focus west-to-east (stable order) |
| Enter / Space | Select marker; expand cluster |
| `+` / `-` | Zoom |
| Arrow keys | Pan |
| Escape | Clear selection |

## 8. States

Standard loading/error/empty patterns; the no-geocodes empty state teaches
the next action ("Locations appear when evidence mentions places or an
analyst confirms a geocode").

## 9. Data requirements (input to the feature milestone)

- A `Geocode` record separate from LOCATION entities: locationEntityId
  (nullable — events can be geocoded without a location entity), latitude,
  longitude, precision enum, confirmed flag, confirmedBy/At, geocoder
  source, and the original place text. One LOCATION entity may carry
  multiple candidate geocodes until an analyst confirms one.
- Read API: `GET /v1/cases/:caseId/geocodes` with bounding-box and
  confirmed/unconfirmed filters; mutation:
  `POST /v1/cases/:caseId/geocodes/:id/confirm` (audited, analyst role).
- Basemap delivery decision per §2 (self-hosted tiles) including where
  tile assets live in self-hosted deployments.
