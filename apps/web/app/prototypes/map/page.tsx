"use client";

import type { Route } from "next";
import Link from "next/link";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import {
  type KeyboardEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type DemoLocation, demoDataset } from "../../../lib/demo";
import { ThemeToggle } from "../../../lib/theme";
import { CATEGORY_COLORS, CATEGORY_OF } from "../graph/taxonomy";
import { entityById, eventById, SourceList } from "../shared";

// Interaction prototype for docs/design/map.md. Development-only. Renders
// markers over a graticule with no tile basemap: prototypes must not call
// external services, and the basemap decision (self-hosted tiles, map.md
// §2) belongs to the feature milestone.

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 680;
const CLUSTER_UNITS = 46;

const bounds = (() => {
  const lats = demoDataset.locations.map((location) => location.latitude);
  const lons = demoDataset.locations.map((location) => location.longitude);
  const padLat = 3;
  const padLon = 4;
  return {
    minLat: Math.min(...lats) - padLat,
    maxLat: Math.max(...lats) + padLat,
    minLon: Math.min(...lons) - padLon,
    maxLon: Math.max(...lons) + padLon,
  };
})();

// Equirectangular projection over the dataset's bounding box.
function project(latitude: number, longitude: number) {
  const x =
    ((longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon)) *
    CANVAS_WIDTH;
  const y =
    ((bounds.maxLat - latitude) / (bounds.maxLat - bounds.minLat)) *
    CANVAS_HEIGHT;
  return { x, y };
}

function locationColor(location: DemoLocation): string {
  const firstEntity = location.entityIds
    .map((id) => entityById.get(id))
    .find((entity) => entity !== undefined);
  return firstEntity
    ? CATEGORY_COLORS[CATEGORY_OF[firstEntity.type]]
    : CATEGORY_COLORS.places;
}

function accessibleName(location: DemoLocation): string {
  const linked = location.entityIds.length + location.eventIds.length;
  return `${location.label}${location.geocodeConfirmed ? "" : " (unconfirmed)"}, ${location.precision} precision, ${linked} linked item${linked === 1 ? "" : "s"}`;
}

interface Cluster {
  members: DemoLocation[];
  x: number;
  y: number;
}

function MapPrototype() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("selected"),
  );
  const [view, setView] = useState<"map" | "table">("map");
  const [viewBox, setViewBox] = useState({
    x: 0,
    y: 0,
    w: CANVAS_WIDTH,
    h: CANVAS_HEIGHT,
  });

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      const query = id ? `?selected=${encodeURIComponent(id)}` : "";
      router.replace(`/prototypes/map${query}` as Route);
    },
    [router],
  );

  useEffect(() => {
    function onWindowKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") select(null);
    }
    window.addEventListener("keydown", onWindowKey);
    return () => window.removeEventListener("keydown", onWindowKey);
  }, [select]);

  // West-to-east ordering gives markers a stable tab order (map.md §7).
  const ordered = useMemo(
    () => [...demoDataset.locations].sort((a, b) => a.longitude - b.longitude),
    [],
  );

  // Markers within a screen-distance threshold collapse to a count chip at
  // their centroid; the threshold tracks zoom so clusters split as the
  // analyst zooms in (map.md §4).
  const { clusters, singles } = useMemo(() => {
    const threshold = CLUSTER_UNITS * (viewBox.w / CANVAS_WIDTH);
    const clusterList: Cluster[] = [];
    const assigned = new Set<string>();
    for (const location of ordered) {
      if (assigned.has(location.id)) continue;
      const point = project(location.latitude, location.longitude);
      const members = [location];
      for (const candidate of ordered) {
        if (candidate.id === location.id || assigned.has(candidate.id)) {
          continue;
        }
        const other = project(candidate.latitude, candidate.longitude);
        if (Math.hypot(other.x - point.x, other.y - point.y) < threshold) {
          members.push(candidate);
        }
      }
      if (members.length >= 2) {
        for (const member of members) assigned.add(member.id);
        const xs = members.map(
          (member) => project(member.latitude, member.longitude).x,
        );
        const ys = members.map(
          (member) => project(member.latitude, member.longitude).y,
        );
        clusterList.push({
          members,
          x: xs.reduce((sum, value) => sum + value, 0) / members.length,
          y: ys.reduce((sum, value) => sum + value, 0) / members.length,
        });
      }
    }
    return {
      clusters: clusterList,
      singles: ordered.filter((location) => !assigned.has(location.id)),
    };
  }, [ordered, viewBox.w]);

  const unconfirmedCount = demoDataset.locations.filter(
    (location) => !location.geocodeConfirmed,
  ).length;

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
      x: previous.x + dx * (previous.w / 15),
      y: previous.y + dy * (previous.h / 15),
    }));
  }

  function zoomToCluster(cluster: Cluster) {
    const xs = cluster.members.map(
      (member) => project(member.latitude, member.longitude).x,
    );
    const ys = cluster.members.map(
      (member) => project(member.latitude, member.longitude).y,
    );
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 60;
    const w = Math.max(120, maxX - minX + pad * 2);
    const h = Math.max(120, maxY - minY + pad * 2);
    setViewBox({
      x: (minX + maxX) / 2 - w / 2,
      y: (minY + maxY) / 2 - h / 2,
      w,
      h,
    });
  }

  function containerKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") zoom(0.7);
    else if (event.key === "-") zoom(1.4);
    else if (event.key === "ArrowLeft") pan(-1, 0);
    else if (event.key === "ArrowRight") pan(1, 0);
    else if (event.key === "ArrowUp") pan(0, -1);
    else if (event.key === "ArrowDown") pan(0, 1);
    else return;
    event.preventDefault();
  }

  function markerKey(event: KeyboardEvent<SVGGElement>, activate: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  }

  const selected = selectedId
    ? demoDataset.locations.find((location) => location.id === selectedId)
    : undefined;
  const selectedSources = selected
    ? [
        ...new Set(
          selected.entityIds.flatMap(
            (id) => entityById.get(id)?.sourceIds ?? [],
          ),
        ),
      ]
    : [];

  const graticule = useMemo(() => {
    const lines: Array<{ key: string; d: string }> = [];
    for (
      let lon = Math.ceil(bounds.minLon / 5) * 5;
      lon <= bounds.maxLon;
      lon += 5
    ) {
      const { x } = project(bounds.minLat, lon);
      lines.push({
        key: `lon-${lon}`,
        d: `M ${x} 0 V ${CANVAS_HEIGHT}`,
      });
    }
    for (
      let lat = Math.ceil(bounds.minLat / 5) * 5;
      lat <= bounds.maxLat;
      lat += 5
    ) {
      const { y } = project(lat, bounds.minLon);
      lines.push({ key: `lat-${lat}`, d: `M 0 ${y} H ${CANVAS_WIDTH}` });
    }
    return lines;
  }, []);

  function precisionRadius(precision: DemoLocation["precision"]): number {
    if (precision === "city") return 16;
    if (precision === "region") return 26;
    return 0;
  }

  return (
    <main className="page" style={{ maxWidth: 1400, overflow: "visible" }}>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Prototype — design milestone phase 5</p>
          <h1 className="pageTitle">Map</h1>
          <p className="pageLede">
            Geocoded locations on the fictional demo dataset, no tile basemap by
            design. Specification: docs/design/map.md. Development only.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="filterBar" style={{ flexWrap: "wrap" }}>
        <fieldset
          style={{ display: "flex", gap: 6, alignItems: "center" }}
          aria-label="Zoom"
        >
          <button
            type="button"
            className="modalClose"
            aria-label="Zoom in"
            onClick={() => zoom(0.7)}
          >
            +
          </button>
          <button
            type="button"
            className="modalClose"
            aria-label="Zoom out"
            onClick={() => zoom(1.4)}
          >
            −
          </button>
          <button
            type="button"
            className="buttonSecondary"
            onClick={() =>
              setViewBox({ x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT })
            }
          >
            Reset view
          </button>
        </fieldset>
        <fieldset
          style={{ display: "flex", gap: 6, alignItems: "center" }}
          aria-label="View"
        >
          <button
            type="button"
            className="buttonSecondary"
            aria-pressed={view === "map"}
            onClick={() => setView("map")}
          >
            Map
          </button>
          <button
            type="button"
            className="buttonSecondary"
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            Table
          </button>
        </fieldset>
      </div>

      <p className="stateNote" aria-live="polite" style={{ padding: "8px 0" }}>
        {demoDataset.locations.length} locations, {unconfirmedCount} with
        unconfirmed geocodes. Dashed markers are unconfirmed; radius circles
        show city or region precision.
      </p>

      {view === "map" ? (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-surface)",
            background: "var(--panel)",
          }}
        >
          <div
            role="application"
            aria-label={`Map canvas. ${demoDataset.locations.length} locations. Tab moves between markers west to east; Enter selects; plus and minus zoom; arrow keys pan.`}
            tabIndex={0}
            onKeyDown={containerKey}
          >
            <svg
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              style={{ width: "100%", height: 560, display: "block" }}
            >
              <title>Map</title>
              {graticule.map((line) => (
                <path
                  key={line.key}
                  d={line.d}
                  stroke="var(--line)"
                  strokeWidth={0.7}
                  fill="none"
                />
              ))}

              {singles.map((location) => {
                const point = project(location.latitude, location.longitude);
                const color = locationColor(location);
                const isSelected = selectedId === location.id;
                const radius = precisionRadius(location.precision);
                return (
                  <g
                    key={location.id}
                    id={`map-${location.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={accessibleName(location)}
                    aria-pressed={isSelected}
                    style={{ cursor: "pointer" }}
                    onClick={() => select(location.id)}
                    onKeyDown={(keyEvent) =>
                      markerKey(keyEvent, () => select(location.id))
                    }
                  >
                    {radius > 0 ? (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={radius}
                        fill={color}
                        fillOpacity={0.12}
                        stroke={color}
                        strokeOpacity={0.5}
                        strokeDasharray={
                          location.precision === "region" ? "5 4" : undefined
                        }
                      />
                    ) : null}
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={7}
                      fill={color}
                      stroke={isSelected ? "var(--accent)" : "var(--ink)"}
                      strokeWidth={isSelected ? 3 : 1}
                      strokeDasharray={
                        location.geocodeConfirmed ? undefined : "3 2"
                      }
                    />
                    {location.entityIds.length + location.eventIds.length >
                    0 ? (
                      <text
                        x={point.x + 10}
                        y={point.y - 8}
                        fontSize={10}
                        fill="var(--muted)"
                      >
                        {location.entityIds.length + location.eventIds.length}
                      </text>
                    ) : null}
                    <text
                      x={point.x + 10}
                      y={point.y + 5}
                      fontSize={11}
                      fill="var(--ink)"
                    >
                      {location.label.length > 24
                        ? `${location.label.slice(0, 23)}…`
                        : location.label}
                      {location.geocodeConfirmed ? "" : " *"}
                    </text>
                  </g>
                );
              })}

              {clusters.map((cluster) => (
                <g
                  key={`cluster-${cluster.members[0]?.id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Cluster of ${cluster.members.length} locations near ${cluster.members[0]?.label}. Activate to zoom in.`}
                  style={{ cursor: "pointer" }}
                  onClick={() => zoomToCluster(cluster)}
                  onKeyDown={(keyEvent) =>
                    markerKey(keyEvent, () => zoomToCluster(cluster))
                  }
                >
                  <circle
                    cx={cluster.x}
                    cy={cluster.y}
                    r={15}
                    fill="var(--accent)"
                    fillOpacity={0.9}
                  />
                  <text
                    x={cluster.x}
                    y={cluster.y + 4}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={700}
                    fill="var(--accent-ink)"
                  >
                    {cluster.members.length}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
      ) : (
        <table className="dataTable">
          <thead>
            <tr>
              <th scope="col">Location</th>
              <th scope="col">Coordinates</th>
              <th scope="col">Precision</th>
              <th scope="col">Geocode</th>
              <th scope="col">Entities</th>
              <th scope="col">Events</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((location) => (
              <tr key={location.id}>
                <td>
                  <button
                    type="button"
                    className="rowLink linkButton"
                    onClick={() => select(location.id)}
                  >
                    {location.label}
                  </button>
                </td>
                <td className="hashValue">
                  {location.latitude.toFixed(3)},{" "}
                  {location.longitude.toFixed(3)}
                </td>
                <td>{location.precision}</td>
                <td>
                  {location.geocodeConfirmed ? (
                    "Confirmed"
                  ) : (
                    <span className="pill auditOutcome-denied">
                      Unconfirmed
                    </span>
                  )}
                </td>
                <td>{location.entityIds.length}</td>
                <td>{location.eventIds.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected ? (
        <aside className="drawer" role="dialog" aria-label="Location details">
          <div className="drawerHeader">
            <div>
              <p className="eyebrow">
                Location · {selected.precision} precision
              </p>
              <h2>{selected.label}</h2>
            </div>
            <button
              type="button"
              className="modalClose"
              onClick={() => select(null)}
            >
              Close
            </button>
          </div>
          {!selected.geocodeConfirmed ? (
            <p className="formError" role="presentation">
              Unconfirmed geocode. An analyst must confirm the position before
              it becomes an accepted fact.
            </p>
          ) : null}
          <dl className="detailList">
            <div>
              <dt>Coordinates</dt>
              <dd className="hashValue">
                {selected.latitude.toFixed(3)}, {selected.longitude.toFixed(3)}
              </dd>
            </div>
            <div>
              <dt>Geocode</dt>
              <dd>{selected.geocodeConfirmed ? "Confirmed" : "Unconfirmed"}</dd>
            </div>
          </dl>
          <h3 className="drawerSectionTitle">
            Entities here ({selected.entityIds.length})
          </h3>
          <ul className="attemptList">
            {selected.entityIds.map((id) => (
              <li key={id}>
                <Link
                  href={
                    `/prototypes/graph?selected=${encodeURIComponent(id)}` as Route
                  }
                >
                  {entityById.get(id)?.label ?? id}
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="drawerSectionTitle">
            Events here ({selected.eventIds.length})
          </h3>
          <ul className="attemptList">
            {selected.eventIds.map((id) => (
              <li key={id}>
                <Link
                  href={
                    `/prototypes/timeline?selected=${encodeURIComponent(id)}` as Route
                  }
                >
                  {eventById.get(id)?.label ?? id}
                </Link>
              </li>
            ))}
          </ul>
          {selectedSources.length > 0 ? (
            <>
              <h3 className="drawerSectionTitle">
                Sources via linked entities ({selectedSources.length})
              </h3>
              <SourceList sourceIds={selectedSources} />
            </>
          ) : null}
          <div className="drawerActions">
            <button
              type="button"
              className="buttonSecondary"
              disabled
              title="Geocode confirmation becomes a real, audited mutation in the feature milestone"
            >
              Confirm geocode
            </button>
          </div>
        </aside>
      ) : null}
    </main>
  );
}

export default function MapPrototypePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <Suspense fallback={<p className="stateNote">Loading prototype…</p>}>
      <MapPrototype />
    </Suspense>
  );
}
