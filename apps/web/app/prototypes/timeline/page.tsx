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
import { type DemoEvent, demoDataset } from "../../../lib/demo";
import { ThemeToggle } from "../../../lib/theme";
import { entityById, formatTimestamp, isDateOnly, SourceList } from "../shared";

// Interaction prototype for docs/design/timeline.md. Development-only.

const CANVAS_WIDTH = 1200;
const LANE_HEIGHT = 44;
const AXIS_HEIGHT = 36;
const DAY_MS = 24 * 60 * 60 * 1000;
const CLUSTER_PX = 18;
const MIN_LABEL_PX = 130;

type Axis = "occurredAt" | "collectedAt";

const fullDomain = (() => {
  const times = demoDataset.events.flatMap((event) => [
    Date.parse(event.occurredAt),
    Date.parse(event.collectedAt),
  ]);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const pad = (max - min) * 0.04;
  return { start: min - pad, end: max + pad };
})();

interface PlacedEvent {
  event: DemoEvent;
  time: number;
  x: number;
  lane: number;
  dateOnly: boolean;
}

function TimelinePrototype() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [axis, setAxis] = useState<Axis>("occurredAt");
  const [domain, setDomain] = useState(fullDomain);
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("selected"),
  );
  const [view, setView] = useState<"timeline" | "table">("timeline");

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      const query = id ? `?selected=${encodeURIComponent(id)}` : "";
      router.replace(`/prototypes/timeline${query}` as Route);
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

  const scale = useCallback(
    (time: number) =>
      ((time - domain.start) / (domain.end - domain.start)) * CANVAS_WIDTH,
    [domain],
  );

  // Events in the current window, positioned and packed into lanes so
  // labels never collide (lane position carries no meaning).
  const placed = useMemo(() => {
    const inWindow = demoDataset.events
      .map((event) => ({ event, time: Date.parse(event[axis]) }))
      .filter(({ time }) => time >= domain.start && time <= domain.end)
      .sort((a, b) => a.time - b.time || a.event.id.localeCompare(b.event.id));
    const laneEnds: number[] = [];
    return inWindow.map(({ event, time }) => {
      const x = scale(time);
      let lane = laneEnds.findIndex((end) => end + MIN_LABEL_PX < x);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(x);
      } else {
        laneEnds[lane] = x;
      }
      return {
        event,
        time,
        x,
        lane,
        dateOnly: isDateOnly(event[axis]),
      } satisfies PlacedEvent;
    });
  }, [axis, domain, scale]);

  // Consecutive items within a small pixel window collapse into a cluster
  // chip; activating it zooms to the cluster span (timeline.md §3).
  const { clusters, singles } = useMemo(() => {
    const clusterList: PlacedEvent[][] = [];
    let current: PlacedEvent[] = [];
    for (const item of placed) {
      const last = current[current.length - 1];
      if (last && item.x - last.x <= CLUSTER_PX) {
        current.push(item);
      } else {
        if (current.length >= 3) clusterList.push(current);
        current = [item];
      }
    }
    if (current.length >= 3) clusterList.push(current);
    const clustered = new Set(clusterList.flat().map((item) => item.event.id));
    return {
      clusters: clusterList,
      singles: placed.filter((item) => !clustered.has(item.event.id)),
    };
  }, [placed]);

  const laneCount = Math.max(1, ...placed.map((item) => item.lane + 1));
  const height = AXIS_HEIGHT + laneCount * LANE_HEIGHT + 20;

  const ticks = useMemo(() => {
    const spanDays = (domain.end - domain.start) / DAY_MS;
    const result: Array<{ x: number; label: string }> = [];
    const cursor = new Date(domain.start);
    cursor.setUTCHours(0, 0, 0, 0);
    if (spanDays > 120) {
      cursor.setUTCDate(1);
      while (cursor.getTime() <= domain.end) {
        result.push({
          x: scale(cursor.getTime()),
          label: cursor.toLocaleDateString(undefined, {
            month: "short",
            year: "2-digit",
          }),
        });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    } else {
      const stepDays = spanDays > 20 ? 7 : 1;
      while (cursor.getTime() <= domain.end) {
        result.push({
          x: scale(cursor.getTime()),
          label: cursor.toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          }),
        });
        cursor.setUTCDate(cursor.getUTCDate() + stepDays);
      }
    }
    return result.filter((tick) => tick.x >= 0 && tick.x <= CANVAS_WIDTH);
  }, [domain, scale]);

  function zoomTo(start: number, end: number) {
    const pad = (end - start) * 0.1 || DAY_MS;
    setDomain({ start: start - pad, end: end + pad });
  }

  function zoom(factor: number) {
    setDomain((previous) => {
      const center = (previous.start + previous.end) / 2;
      const half = ((previous.end - previous.start) / 2) * factor;
      return { start: center - half, end: center + half };
    });
  }

  function pan(direction: -1 | 1) {
    setDomain((previous) => {
      const step = (previous.end - previous.start) / 10;
      return {
        start: previous.start + step * direction,
        end: previous.end + step * direction,
      };
    });
  }

  function stepFocus(currentId: string, direction: -1 | 1) {
    const order = [
      ...singles.map((item) => ({ id: item.event.id, x: item.x })),
      ...clusters.map((cluster) => ({
        id: `cluster-${cluster[0]?.event.id}`,
        x: cluster[0]?.x ?? 0,
      })),
    ].sort((a, b) => a.x - b.x);
    const index = order.findIndex((entry) => entry.id === currentId);
    const next = order[index + direction];
    if (next) document.getElementById(`tl-${next.id}`)?.focus();
  }

  function markerKey(
    event: KeyboardEvent<SVGGElement>,
    id: string,
    activate: () => void,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepFocus(id, -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      stepFocus(id, 1);
    }
  }

  function containerKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "+" || event.key === "=") zoom(0.7);
    else if (event.key === "-") zoom(1.4);
    else if (event.key === "ArrowLeft" && event.shiftKey) pan(-1);
    else if (event.key === "ArrowRight" && event.shiftKey) pan(1);
    else return;
    event.preventDefault();
  }

  const selectedEvent = selectedId
    ? demoDataset.events.find((event) => event.id === selectedId)
    : undefined;

  const rangeLabel = `${new Date(domain.start).toLocaleDateString()} – ${new Date(domain.end).toLocaleDateString()}`;

  return (
    <main className="page" style={{ maxWidth: 1400, overflow: "visible" }}>
      <div className="pageHeader">
        <div>
          <p className="eyebrow">Prototype — design milestone phase 5</p>
          <h1 className="pageTitle">Timeline</h1>
          <p className="pageLede">
            Dual-time chronology on the fictional demo dataset. Specification:
            docs/design/timeline.md. Development only.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="filterBar" style={{ flexWrap: "wrap" }}>
        <fieldset
          style={{ display: "flex", gap: 6, alignItems: "center" }}
          aria-label="Primary time axis"
        >
          <button
            type="button"
            className="buttonSecondary"
            aria-pressed={axis === "occurredAt"}
            onClick={() => setAxis("occurredAt")}
          >
            Event time
          </button>
          <button
            type="button"
            className="buttonSecondary"
            aria-pressed={axis === "collectedAt"}
            onClick={() => setAxis("collectedAt")}
          >
            Collection time
          </button>
        </fieldset>
        <fieldset
          style={{ display: "flex", gap: 6, alignItems: "center" }}
          aria-label="Zoom presets"
        >
          <button
            type="button"
            className="buttonSecondary"
            onClick={() => setDomain(fullDomain)}
          >
            All
          </button>
          <button
            type="button"
            className="buttonSecondary"
            onClick={() =>
              setDomain({
                start: Date.parse("2026-01-01T00:00:00Z"),
                end: Date.parse("2026-06-01T00:00:00Z"),
              })
            }
          >
            2026
          </button>
          <button
            type="button"
            className="buttonSecondary"
            onClick={() =>
              setDomain({
                start: Date.parse("2026-03-01T00:00:00Z"),
                end: Date.parse("2026-04-01T00:00:00Z"),
              })
            }
          >
            March 2026
          </button>
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
            className="modalClose"
            aria-label="Pan earlier"
            onClick={() => pan(-1)}
          >
            ←
          </button>
          <button
            type="button"
            className="modalClose"
            aria-label="Pan later"
            onClick={() => pan(1)}
          >
            →
          </button>
        </fieldset>
        <fieldset
          style={{ display: "flex", gap: 6, alignItems: "center" }}
          aria-label="View"
        >
          <button
            type="button"
            className="buttonSecondary"
            aria-pressed={view === "timeline"}
            onClick={() => setView("timeline")}
          >
            Timeline
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
        {placed.length} of {demoDataset.events.length} events in view ·{" "}
        {rangeLabel} ·{" "}
        {axis === "occurredAt" ? "event time" : "collection time"} axis. Lane
        position carries no meaning.
      </p>

      {placed.length === 0 ? (
        <div className="emptyState">
          <h2>No events in this window</h2>
          <p>The current window excludes every event.</p>
          <button
            type="button"
            className="buttonPrimary"
            onClick={() => setDomain(fullDomain)}
          >
            Show all
          </button>
        </div>
      ) : view === "timeline" ? (
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-surface)",
            background: "var(--panel)",
          }}
        >
          <div
            role="application"
            aria-label={`Timeline canvas. ${placed.length} events in view. Tab moves between events; arrow keys step chronologically; Enter selects; plus and minus zoom; shift plus arrows pan.`}
            tabIndex={0}
            onKeyDown={containerKey}
          >
            <svg
              viewBox={`0 0 ${CANVAS_WIDTH} ${height}`}
              style={{ width: "100%", display: "block" }}
            >
              <title>Timeline</title>
              {ticks.map((tick) => (
                <g key={tick.x}>
                  <line
                    x1={tick.x}
                    y1={AXIS_HEIGHT}
                    x2={tick.x}
                    y2={height}
                    stroke="var(--line)"
                  />
                  <text
                    x={tick.x + 4}
                    y={AXIS_HEIGHT - 10}
                    fontSize={11}
                    fill="var(--muted)"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}

              {singles.map((item) => {
                const y = AXIS_HEIGHT + item.lane * LANE_HEIGHT + 22;
                const selected = selectedId === item.event.id;
                const dayWidth = Math.max(
                  6,
                  scale(item.time + DAY_MS) - item.x,
                );
                return (
                  <g
                    key={item.event.id}
                    id={`tl-${item.event.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${item.event.label}, ${formatTimestamp(item.event[axis])}`}
                    aria-pressed={selected}
                    style={{ cursor: "pointer" }}
                    onClick={() => select(item.event.id)}
                    onKeyDown={(keyEvent) =>
                      markerKey(keyEvent, item.event.id, () =>
                        select(item.event.id),
                      )
                    }
                  >
                    {item.dateOnly ? (
                      // Date-only precision renders as a day span, not a
                      // fabricated midnight instant (timeline.md §4).
                      <rect
                        x={item.x}
                        y={y - 6}
                        width={dayWidth}
                        height={12}
                        fill="none"
                        stroke={selected ? "var(--accent)" : "var(--muted)"}
                        strokeWidth={selected ? 2.5 : 1.5}
                        rx={3}
                      />
                    ) : (
                      <circle
                        cx={item.x}
                        cy={y}
                        r={6}
                        fill={selected ? "var(--accent)" : "var(--muted)"}
                      />
                    )}
                    <text
                      x={item.x + (item.dateOnly ? dayWidth + 5 : 10)}
                      y={y + 4}
                      fontSize={11}
                      fill="var(--ink)"
                    >
                      {item.event.label.length > 24
                        ? `${item.event.label.slice(0, 23)}…`
                        : item.event.label}
                    </text>
                  </g>
                );
              })}

              {clusters.map((cluster) => {
                const first = cluster[0];
                const last = cluster[cluster.length - 1];
                if (!first || !last) return null;
                const x = (first.x + last.x) / 2;
                const y = AXIS_HEIGHT + first.lane * LANE_HEIGHT + 22;
                const fromLabel = new Date(first.time).toLocaleDateString();
                const toLabel = new Date(last.time).toLocaleDateString();
                return (
                  <g
                    key={`cluster-${first.event.id}`}
                    id={`tl-cluster-${first.event.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Cluster of ${cluster.length} events, ${fromLabel} to ${toLabel}. Activate to zoom in.`}
                    style={{ cursor: "pointer" }}
                    onClick={() => zoomTo(first.time, last.time)}
                    onKeyDown={(keyEvent) =>
                      markerKey(keyEvent, `cluster-${first.event.id}`, () =>
                        zoomTo(first.time, last.time),
                      )
                    }
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={13}
                      fill="var(--accent)"
                      fillOpacity={0.9}
                    />
                    <text
                      x={x}
                      y={y + 4}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={700}
                      fill="var(--accent-ink)"
                    >
                      {cluster.length}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      ) : (
        <table className="dataTable">
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Occurred</th>
              <th scope="col">Observed</th>
              <th scope="col">Published</th>
              <th scope="col">Collected</th>
              <th scope="col">Entities</th>
            </tr>
          </thead>
          <tbody>
            {placed.map(({ event }) => (
              <tr key={event.id}>
                <td>
                  <button
                    type="button"
                    className="rowLink linkButton"
                    onClick={() => select(event.id)}
                  >
                    {event.label}
                  </button>
                </td>
                <td>{formatTimestamp(event.occurredAt)}</td>
                <td>
                  {event.observedAt ? formatTimestamp(event.observedAt) : "—"}
                </td>
                <td>
                  {event.publishedAt ? formatTimestamp(event.publishedAt) : "—"}
                </td>
                <td>{formatTimestamp(event.collectedAt)}</td>
                <td>{event.entityIds.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selectedEvent ? (
        <aside className="drawer" role="dialog" aria-label="Event details">
          <div className="drawerHeader">
            <div>
              <p className="eyebrow">Event</p>
              <h2>{selectedEvent.label}</h2>
            </div>
            <button
              type="button"
              className="modalClose"
              onClick={() => select(null)}
            >
              Close
            </button>
          </div>
          <dl className="detailList">
            <div>
              <dt>Occurred</dt>
              <dd>{formatTimestamp(selectedEvent.occurredAt)}</dd>
            </div>
            {selectedEvent.observedAt ? (
              <div>
                <dt>Observed</dt>
                <dd>{formatTimestamp(selectedEvent.observedAt)}</dd>
              </div>
            ) : null}
            {selectedEvent.publishedAt ? (
              <div>
                <dt>Published</dt>
                <dd>{formatTimestamp(selectedEvent.publishedAt)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Collected</dt>
              <dd>{formatTimestamp(selectedEvent.collectedAt)}</dd>
            </div>
            <div>
              <dt>Summary</dt>
              <dd>{selectedEvent.summary}</dd>
            </div>
          </dl>
          <h3 className="drawerSectionTitle">
            Entities ({selectedEvent.entityIds.length})
          </h3>
          <ul className="attemptList">
            {selectedEvent.entityIds.map((id) => (
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
            Sources ({selectedEvent.sourceIds.length})
          </h3>
          <SourceList sourceIds={selectedEvent.sourceIds} />
        </aside>
      ) : null}
    </main>
  );
}

export default function TimelinePrototypePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return (
    <Suspense fallback={<p className="stateNote">Loading prototype…</p>}>
      <TimelinePrototype />
    </Suspense>
  );
}
