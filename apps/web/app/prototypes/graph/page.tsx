"use client";

import type { Route } from "next";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type DemoEntity,
  type DemoRelation,
  demoDataset,
} from "../../../lib/demo";
import { ThemeToggle } from "../../../lib/theme";
import { computeLayout } from "./force-layout";
import {
  ALL_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_OF,
  confidenceOpacity,
  edgeDash,
  type GraphCategory,
  shapePath,
  TYPE_GLYPHS,
} from "./taxonomy";

// Interaction prototype for docs/design/graph.md. Development-only; inline
// styles are prototype scaffolding kept out of the production stylesheet.

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const NODE_RADIUS = 14;
const SYMMETRIC_RELATIONS = new Set([
  "AFFILIATED_WITH",
  "LINKED_TO",
  "CONTRADICTS",
]);

const entityById = new Map(
  demoDataset.entities.map((entity) => [entity.id, entity]),
);
const evidenceById = new Map(
  demoDataset.evidence.map((item) => [item.id, item]),
);
const neighborsOf = (() => {
  const map = new Map<string, Set<string>>();
  for (const entity of demoDataset.entities) map.set(entity.id, new Set());
  for (const relation of demoDataset.relations) {
    map.get(relation.fromId)?.add(relation.toId);
    map.get(relation.toId)?.add(relation.fromId);
  }
  return map;
})();

function nodeAccessibleName(entity: DemoEntity): string {
  const relationCount = neighborsOf.get(entity.id)?.size ?? 0;
  return `${entity.label}, ${entity.type.toLowerCase().replaceAll("_", " ")}, confidence ${entity.confidence.toFixed(2)}, ${relationCount} relation${relationCount === 1 ? "" : "s"}`;
}

interface Filters {
  categories: Set<GraphCategory>;
  minConfidence: number;
  sourceId: string;
  from: string;
  to: string;
}

function GraphPrototype() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<Filters>({
    categories: new Set(ALL_CATEGORIES),
    minConfidence: 0,
    sourceId: "",
    from: "",
    to: "",
  });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("selected"),
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [focusRootId, setFocusRootId] = useState<string | null>(null);
  const [view, setView] = useState<"graph" | "list">("graph");
  const [viewBox, setViewBox] = useState({
    x: 0,
    y: 0,
    w: CANVAS_WIDTH,
    h: CANVAS_HEIGHT,
  });
  const dragState = useRef<{ x: number; y: number } | null>(null);

  // Layout over the full dataset, independent of filters, so positions stay
  // stable while filtering (graph.md §2 spatial-memory requirement).
  const layout = useMemo(
    () =>
      computeLayout(
        demoDataset.entities.map((entity) => entity.id),
        demoDataset.relations.map((relation) => [
          relation.fromId,
          relation.toId,
        ]),
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
      ),
    [],
  );

  const selectEntity = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      setSelectedEdgeId(null);
      const query = id ? `?selected=${encodeURIComponent(id)}` : "";
      router.replace(`/prototypes/graph${query}` as Route);
    },
    [router],
  );

  const focusSet = useMemo(() => {
    if (!focusRootId) return null;
    const set = new Set([focusRootId]);
    for (const neighbor of neighborsOf.get(focusRootId) ?? []) {
      set.add(neighbor);
    }
    return set;
  }, [focusRootId]);

  const visibleEntities = useMemo(
    () =>
      demoDataset.entities.filter((entity) => {
        if (!filters.categories.has(CATEGORY_OF[entity.type])) return false;
        if (entity.confidence < filters.minConfidence) return false;
        if (filters.sourceId && !entity.sourceIds.includes(filters.sourceId)) {
          return false;
        }
        if (filters.from && entity.firstObserved < filters.from) return false;
        if (filters.to && entity.firstObserved > filters.to) return false;
        if (focusSet && !focusSet.has(entity.id)) return false;
        return true;
      }),
    [filters, focusSet],
  );
  const visibleIds = useMemo(
    () => new Set(visibleEntities.map((entity) => entity.id)),
    [visibleEntities],
  );
  const visibleRelations = useMemo(
    () =>
      demoDataset.relations.filter(
        (relation) =>
          visibleIds.has(relation.fromId) && visibleIds.has(relation.toId),
      ),
    [visibleIds],
  );

  const searchLower = search.trim().toLowerCase();
  const matchesSearch = useCallback(
    (entity: DemoEntity) =>
      searchLower.length === 0 ||
      entity.label.toLowerCase().includes(searchLower),
    [searchLower],
  );

  const selectedEntity = selectedId ? entityById.get(selectedId) : undefined;
  const selectedEdge = selectedEdgeId
    ? demoDataset.relations.find((relation) => relation.id === selectedEdgeId)
    : undefined;
  const selectionNeighbors = selectedId
    ? (neighborsOf.get(selectedId) ?? new Set<string>())
    : null;

  const filtersActive =
    filters.categories.size !== ALL_CATEGORIES.length ||
    filters.minConfidence > 0 ||
    filters.sourceId !== "" ||
    filters.from !== "" ||
    filters.to !== "";

  function clearFilters() {
    setFilters({
      categories: new Set(ALL_CATEGORIES),
      minConfidence: 0,
      sourceId: "",
      from: "",
      to: "",
    });
    setSearch("");
  }

  function toggleCategory(category: GraphCategory) {
    setFilters((previous) => {
      const categories = new Set(previous.categories);
      if (categories.has(category)) categories.delete(category);
      else categories.add(category);
      return { ...previous, categories };
    });
  }

  function zoom(factor: number) {
    setViewBox((previous) => {
      const w = previous.w * factor;
      const h = previous.h * factor;
      return {
        x: previous.x + (previous.w - w) / 2,
        y: previous.y + (previous.h - h) / 2,
        w,
        h,
      };
    });
  }

  function pan(dx: number, dy: number) {
    setViewBox((previous) => ({
      ...previous,
      x: previous.x + dx * (previous.w / 20),
      y: previous.y + dy * (previous.h / 20),
    }));
  }

  function handleCanvasKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") zoom(0.8);
    else if (event.key === "-") zoom(1.25);
    else if (event.key === "ArrowLeft" && !selectedId) pan(-1, 0);
    else if (event.key === "ArrowRight" && !selectedId) pan(1, 0);
    else if (event.key === "ArrowUp" && !selectedId) pan(0, -1);
    else if (event.key === "ArrowDown" && !selectedId) pan(0, 1);
    else return;
    event.preventDefault();
  }

  const handleEscape = useCallback(() => {
    if (selectedId || selectedEdgeId) {
      selectEntity(null);
    } else if (focusRootId) {
      setFocusRootId(null);
    }
  }, [selectedId, selectedEdgeId, focusRootId, selectEntity]);

  // Escape works anywhere on the page (graph.md §7), not only with a node
  // focused: first press clears selection, second exits focus mode.
  useEffect(() => {
    function onWindowKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") handleEscape();
    }
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
  }, [handleEscape]);

  // [ and ] step focus through the selected node's visible neighbors.
  function stepNeighbor(direction: 1 | -1) {
    if (!selectedId) return;
    const neighborIds = [...(neighborsOf.get(selectedId) ?? [])].filter((id) =>
      visibleIds.has(id),
    );
    if (neighborIds.length === 0) return;
    const focused = document.activeElement?.id?.replace("node-", "");
    const currentIndex = focused ? neighborIds.indexOf(focused) : -1;
    const next =
      neighborIds[
        (currentIndex + direction + neighborIds.length) % neighborIds.length
      ];
    if (next) document.getElementById(`node-${next}`)?.focus();
  }

  function handleNodeKey(event: KeyboardEvent<SVGGElement>, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectEntity(id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      handleEscape();
    } else if (event.key === "[") {
      event.preventDefault();
      stepNeighbor(-1);
    } else if (event.key === "]") {
      event.preventDefault();
      stepNeighbor(1);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.target === event.currentTarget) {
      dragState.current = { x: event.clientX, y: event.clientY };
    }
  }
  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragState.current;
    if (!drag) return;
    const scale = viewBox.w / CANVAS_WIDTH;
    setViewBox((previous) => ({
      ...previous,
      x: previous.x - (event.clientX - drag.x) * scale,
      y: previous.y - (event.clientY - drag.y) * scale,
    }));
    dragState.current = { x: event.clientX, y: event.clientY };
  }

  // Parallel edges between the same pair curve apart (graph.md §4).
  const parallelOffset = useMemo(() => {
    const counts = new Map<string, number>();
    const offsets = new Map<string, number>();
    for (const relation of demoDataset.relations) {
      const key = [relation.fromId, relation.toId].sort().join("|");
      const seen = counts.get(key) ?? 0;
      offsets.set(relation.id, seen);
      counts.set(key, seen + 1);
    }
    return offsets;
  }, []);

  const showEdgeLabels = visibleRelations.length <= 30;

  function nodeOpacity(entity: DemoEntity): number {
    let opacity = 1;
    if (selectionNeighbors && selectedId !== entity.id) {
      opacity = selectionNeighbors.has(entity.id) ? 0.9 : 0.35;
    }
    if (!matchesSearch(entity)) opacity = Math.min(opacity, 0.2);
    return opacity;
  }

  return (
    <main className="page" style={{ maxWidth: 1400, overflow: "visible" }}>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Prototype — design milestone phase 4</p>
          <h1 className="pageTitle">Entity graph</h1>
          <p className="pageLede">
            Interaction prototype on the fictional demo dataset. Specification:
            docs/design/graph.md. Development only.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="filterBar" style={{ flexWrap: "wrap" }}>
        {ALL_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className="pill"
            aria-pressed={filters.categories.has(category)}
            onClick={() => toggleCategory(category)}
            style={{
              cursor: "pointer",
              background: filters.categories.has(category)
                ? "var(--panel)"
                : "transparent",
              borderColor: filters.categories.has(category)
                ? CATEGORY_COLORS[category]
                : "var(--line)",
              opacity: filters.categories.has(category) ? 1 : 0.55,
            }}
          >
            {CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>
      <div className="filterBar" style={{ flexWrap: "wrap" }}>
        <label
          className="pill"
          htmlFor="graph-confidence"
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          Min confidence
          <input
            id="graph-confidence"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={filters.minConfidence}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                minConfidence: Number(event.target.value),
              }))
            }
            style={{ width: 120, padding: 0 }}
          />
          <output>{filters.minConfidence.toFixed(2)}</output>
        </label>
        <label className="srOnly" htmlFor="graph-source">
          Filter by source
        </label>
        <select
          id="graph-source"
          value={filters.sourceId}
          onChange={(event) =>
            setFilters((previous) => ({
              ...previous,
              sourceId: event.target.value,
            }))
          }
        >
          <option value="">All sources</option>
          {demoDataset.evidence.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
        <label className="srOnly" htmlFor="graph-from">
          Observed on or after
        </label>
        <input
          id="graph-from"
          type="date"
          value={filters.from}
          onChange={(event) =>
            setFilters((previous) => ({
              ...previous,
              from: event.target.value,
            }))
          }
          style={{ width: "auto" }}
        />
        <label className="srOnly" htmlFor="graph-to">
          Observed on or before
        </label>
        <input
          id="graph-to"
          type="date"
          value={filters.to}
          onChange={(event) =>
            setFilters((previous) => ({ ...previous, to: event.target.value }))
          }
          style={{ width: "auto" }}
        />
        <label className="srOnly" htmlFor="graph-search">
          Search entities by label
        </label>
        <input
          id="graph-search"
          type="search"
          placeholder="Search labels…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
        {filtersActive ? (
          <button
            type="button"
            className="buttonSecondary"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        ) : null}
        <fieldset style={{ display: "flex", gap: 6 }} aria-label="View">
          <button
            type="button"
            className="buttonSecondary"
            aria-pressed={view === "graph"}
            onClick={() => setView("graph")}
          >
            Graph
          </button>{" "}
          <button
            type="button"
            className="buttonSecondary"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </button>
        </fieldset>
      </div>

      <p className="stateNote" aria-live="polite" style={{ padding: "8px 0" }}>
        Showing {visibleEntities.length} of {demoDataset.entities.length}{" "}
        entities, {visibleRelations.length} of {demoDataset.relations.length}{" "}
        relations.
        {focusRootId ? (
          <>
            {" "}
            Focused on {entityById.get(focusRootId)?.label}.{" "}
            <button
              type="button"
              className="linkButton"
              style={{ textDecoration: "underline" }}
              onClick={() => setFocusRootId(null)}
            >
              Show all
            </button>
          </>
        ) : null}
      </p>

      {visibleEntities.length === 0 ? (
        <div className="emptyState">
          <h2>Nothing matches the current filters</h2>
          <p>Every entity is filtered out. Clear the filters to start over.</p>
          <button
            type="button"
            className="buttonPrimary"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>
      ) : view === "graph" ? (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-surface)",
            background: "var(--panel)",
            position: "relative",
          }}
        >
          <div style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}>
            <button
              type="button"
              className="modalClose"
              aria-label="Zoom in"
              onClick={() => zoom(0.8)}
            >
              +
            </button>{" "}
            <button
              type="button"
              className="modalClose"
              aria-label="Zoom out"
              onClick={() => zoom(1.25)}
            >
              −
            </button>
          </div>
          {/* The canvas wrapper is a composite keyboard widget (role="application", graph.md §7); noNoninteractiveTabindex is disabled for prototypes in biome.json. */}
          <div
            role="application"
            aria-label={`Entity graph canvas. ${visibleEntities.length} entities visible. Tab moves between entities; Enter selects; plus and minus zoom; arrow keys pan.`}
            tabIndex={0}
            onKeyDown={handleCanvasKey}
          >
            <svg
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              style={{
                width: "100%",
                height: 640,
                display: "block",
                cursor: "grab",
              }}
              aria-hidden={false}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={() => {
                dragState.current = null;
              }}
              onPointerLeave={() => {
                dragState.current = null;
              }}
            >
              <title>Entity graph</title>
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX={9}
                  refY={5}
                  markerWidth={7}
                  markerHeight={7}
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" />
                </marker>
                <marker
                  id="arrow-accent"
                  viewBox="0 0 10 10"
                  refX={9}
                  refY={5}
                  markerWidth={7}
                  markerHeight={7}
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
                </marker>
              </defs>

              {visibleRelations.map((relation) => {
                const from = layout.get(relation.fromId);
                const to = layout.get(relation.toId);
                if (!from || !to) return null;
                const symmetric = SYMMETRIC_RELATIONS.has(relation.type);
                const contradiction = relation.type === "CONTRADICTS";
                const touchesSelection =
                  selectedId === relation.fromId ||
                  selectedId === relation.toId;
                const isSelectedEdge = selectedEdgeId === relation.id;
                const stroke = contradiction
                  ? "var(--danger-accent)"
                  : touchesSelection || isSelectedEdge
                    ? "var(--accent)"
                    : "var(--muted)";
                const offsetIndex = parallelOffset.get(relation.id) ?? 0;
                const midX = (from.x + to.x) / 2;
                const midY = (from.y + to.y) / 2;
                const normX = -(to.y - from.y);
                const normY = to.x - from.x;
                const norm = Math.hypot(normX, normY) || 1;
                const bend = offsetIndex * 26;
                const controlX = midX + (normX / norm) * bend;
                const controlY = midY + (normY / norm) * bend;
                const labelVisible =
                  showEdgeLabels || touchesSelection || isSelectedEdge;
                return (
                  <g key={relation.id}>
                    {/* biome-ignore lint/a11y/noStaticElementInteractions: keyboard access to relations is provided through the detail panel's relation list (graph.md §7) */}
                    <path
                      d={`M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={isSelectedEdge ? 2.5 : 1.5}
                      strokeOpacity={
                        touchesSelection || isSelectedEdge ? 1 : 0.6
                      }
                      strokeDasharray={edgeDash(relation.confidence)}
                      markerEnd={
                        symmetric
                          ? undefined
                          : touchesSelection || isSelectedEdge
                            ? "url(#arrow-accent)"
                            : "url(#arrow)"
                      }
                      style={{ cursor: "pointer" }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedEdgeId(relation.id);
                        setSelectedId(null);
                      }}
                    />
                    {labelVisible ? (
                      <text
                        x={controlX}
                        y={controlY - 4}
                        textAnchor="middle"
                        fontSize={10}
                        fill="var(--muted)"
                      >
                        {relation.type}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              {visibleEntities.map((entity) => {
                const point = layout.get(entity.id);
                if (!point) return null;
                const category = CATEGORY_OF[entity.type];
                const selected = selectedId === entity.id;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: HTML <button> cannot exist inside SVG; role="button" on a focusable <g> is the accessible SVG pattern
                  <g
                    key={entity.id}
                    id={`node-${entity.id}`}
                    transform={`translate(${point.x} ${point.y})`}
                    role="button"
                    tabIndex={0}
                    aria-label={nodeAccessibleName(entity)}
                    aria-pressed={selected}
                    opacity={nodeOpacity(entity)}
                    style={{ cursor: "pointer" }}
                    onClick={() => selectEntity(entity.id)}
                    onKeyDown={(event) => handleNodeKey(event, entity.id)}
                  >
                    <path
                      d={shapePath(category, NODE_RADIUS)}
                      fill={CATEGORY_COLORS[category]}
                      fillOpacity={confidenceOpacity(entity.confidence)}
                      stroke={selected ? "var(--accent)" : "var(--line)"}
                      strokeWidth={selected ? 3 : 1}
                    />
                    <text
                      textAnchor="middle"
                      dy={4}
                      fontSize={9}
                      fontWeight={700}
                      fill="var(--accent-ink)"
                      style={{ pointerEvents: "none" }}
                    >
                      {TYPE_GLYPHS[entity.type]}
                    </text>
                    <text
                      textAnchor="middle"
                      y={NODE_RADIUS + 13}
                      fontSize={11}
                      fill="var(--ink)"
                      style={{ pointerEvents: "none" }}
                    >
                      {entity.label.length > 26
                        ? `${entity.label.slice(0, 25)}…`
                        : entity.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      ) : (
        <ConnectionsList
          entities={visibleEntities}
          relations={visibleRelations}
          selectedId={selectedId}
          onSelect={selectEntity}
          matchesSearch={matchesSearch}
        />
      )}

      {selectedEntity ? (
        <EntityDrawer
          entity={selectedEntity}
          visibleIds={visibleIds}
          onSelect={selectEntity}
          onFocus={() => setFocusRootId(selectedEntity.id)}
          onSelectEdge={(id) => {
            setSelectedEdgeId(id);
            setSelectedId(null);
          }}
          onClose={() => selectEntity(null)}
        />
      ) : null}
      {selectedEdge ? (
        <EdgeDrawer
          relation={selectedEdge}
          onSelect={selectEntity}
          onClose={() => setSelectedEdgeId(null)}
        />
      ) : null}
    </main>
  );
}

function SourceList({ sourceIds }: { sourceIds: string[] }) {
  return (
    <ul className="attemptList">
      {sourceIds.map((id) => {
        const item = evidenceById.get(id);
        if (!item) return null;
        return (
          <li key={id}>
            <strong>{item.title}</strong> — {item.method},{" "}
            {new Date(item.collectedAt).toLocaleDateString()}
          </li>
        );
      })}
    </ul>
  );
}

function EntityDrawer({
  entity,
  visibleIds,
  onSelect,
  onFocus,
  onSelectEdge,
  onClose,
}: {
  entity: DemoEntity;
  visibleIds: Set<string>;
  onSelect: (id: string) => void;
  onFocus: () => void;
  onSelectEdge: (id: string) => void;
  onClose: () => void;
}) {
  const related = demoDataset.relations.filter(
    (relation) => relation.fromId === entity.id || relation.toId === entity.id,
  );
  return (
    <aside className="drawer" role="dialog" aria-label="Entity details">
      <div className="drawerHeader">
        <div>
          <p className="eyebrow">
            {CATEGORY_LABELS[CATEGORY_OF[entity.type]]} ·{" "}
            {entity.type.toLowerCase().replaceAll("_", " ")}
          </p>
          <h2>{entity.label}</h2>
        </div>
        <button type="button" className="modalClose" onClick={onClose}>
          Close
        </button>
      </div>
      <dl className="detailList">
        <div>
          <dt>Confidence</dt>
          <dd>{entity.confidence.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Handling level</dt>
          <dd>
            <span
              className={`pill handling-${entity.handlingLevel.toLowerCase()}`}
            >
              {entity.handlingLevel}
            </span>
          </dd>
        </div>
        <div>
          <dt>First observed</dt>
          <dd>{entity.firstObserved}</dd>
        </div>
        <div>
          <dt>Summary</dt>
          <dd>{entity.summary}</dd>
        </div>
      </dl>
      <h3 className="drawerSectionTitle">
        Sources ({entity.sourceIds.length})
      </h3>
      <SourceList sourceIds={entity.sourceIds} />
      <h3 className="drawerSectionTitle">Relations ({related.length})</h3>
      <ul className="attemptList">
        {related.map((relation) => {
          const otherId =
            relation.fromId === entity.id ? relation.toId : relation.fromId;
          const other = entityById.get(otherId);
          const direction = relation.fromId === entity.id ? "→" : "←";
          return (
            <li key={relation.id}>
              <button
                type="button"
                className="linkButton"
                style={{ textDecoration: "underline" }}
                onClick={() => onSelectEdge(relation.id)}
              >
                {relation.type}
              </button>{" "}
              {direction}{" "}
              <button
                type="button"
                className="linkButton"
                style={{
                  textDecoration: "underline",
                  opacity: visibleIds.has(otherId) ? 1 : 0.5,
                }}
                onClick={() => onSelect(otherId)}
              >
                {other?.label ?? otherId}
              </button>{" "}
              ({relation.confidence.toFixed(2)})
            </li>
          );
        })}
      </ul>
      <div className="drawerActions">
        <button type="button" className="buttonPrimary" onClick={onFocus}>
          Focus on neighborhood
        </button>
      </div>
    </aside>
  );
}

function EdgeDrawer({
  relation,
  onSelect,
  onClose,
}: {
  relation: DemoRelation;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const from = entityById.get(relation.fromId);
  const to = entityById.get(relation.toId);
  return (
    <aside className="drawer" role="dialog" aria-label="Relation details">
      <div className="drawerHeader">
        <div>
          <p className="eyebrow">Relation</p>
          <h2>{relation.type}</h2>
        </div>
        <button type="button" className="modalClose" onClick={onClose}>
          Close
        </button>
      </div>
      <dl className="detailList">
        <div>
          <dt>From</dt>
          <dd>
            <button
              type="button"
              className="linkButton"
              style={{ textDecoration: "underline" }}
              onClick={() => onSelect(relation.fromId)}
            >
              {from?.label}
            </button>
          </dd>
        </div>
        <div>
          <dt>To</dt>
          <dd>
            <button
              type="button"
              className="linkButton"
              style={{ textDecoration: "underline" }}
              onClick={() => onSelect(relation.toId)}
            >
              {to?.label}
            </button>
          </dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{relation.confidence.toFixed(2)}</dd>
        </div>
        {relation.note ? (
          <div>
            <dt>Note</dt>
            <dd>{relation.note}</dd>
          </div>
        ) : null}
      </dl>
      <h3 className="drawerSectionTitle">
        Sources ({relation.sourceIds.length})
      </h3>
      <SourceList sourceIds={relation.sourceIds} />
    </aside>
  );
}

function ConnectionsList({
  entities,
  relations,
  selectedId,
  onSelect,
  matchesSearch,
}: {
  entities: DemoEntity[];
  relations: DemoRelation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  matchesSearch: (entity: DemoEntity) => boolean;
}) {
  const relationsByEntity = useMemo(() => {
    const map = new Map<string, DemoRelation[]>();
    for (const relation of relations) {
      for (const id of [relation.fromId, relation.toId]) {
        const list = map.get(id) ?? [];
        list.push(relation);
        map.set(id, list);
      }
    }
    return map;
  }, [relations]);

  return (
    <div>
      {ALL_CATEGORIES.map((category) => {
        const group = entities.filter(
          (entity) =>
            CATEGORY_OF[entity.type] === category && matchesSearch(entity),
        );
        if (group.length === 0) return null;
        return (
          <section key={category} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: "var(--text-lg)" }}>
              {CATEGORY_LABELS[category]} ({group.length})
            </h2>
            {group.map((entity) => (
              <details
                key={entity.id}
                open={selectedId === entity.id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-control)",
                  padding: "10px 14px",
                  marginBottom: 8,
                }}
              >
                <summary style={{ cursor: "pointer" }}>
                  {nodeAccessibleName(entity)}
                </summary>
                <p className="fieldHint">{entity.summary}</p>
                <ul className="attemptList">
                  {(relationsByEntity.get(entity.id) ?? []).map((relation) => {
                    const otherId =
                      relation.fromId === entity.id
                        ? relation.toId
                        : relation.fromId;
                    const other = entityById.get(otherId);
                    const direction = relation.fromId === entity.id ? "→" : "←";
                    return (
                      <li key={relation.id}>
                        {relation.type} {direction}{" "}
                        <button
                          type="button"
                          className="linkButton"
                          style={{ textDecoration: "underline" }}
                          onClick={() => onSelect(otherId)}
                        >
                          {other?.label ?? otherId}
                        </button>
                        , confidence {relation.confidence.toFixed(2)},{" "}
                        {relation.sourceIds.length} source
                        {relation.sourceIds.length === 1 ? "" : "s"}
                      </li>
                    );
                  })}
                </ul>
                <h3 className="drawerSectionTitle">Sources</h3>
                <SourceList sourceIds={entity.sourceIds} />
              </details>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export default function GraphPrototypePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <Suspense fallback={<p className="stateNote">Loading prototype…</p>}>
      <GraphPrototype />
    </Suspense>
  );
}
