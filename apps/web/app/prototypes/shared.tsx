import { demoDataset } from "../../lib/demo";

// Shared lookup helpers for the prototype routes. Prototype-local by
// design; the real surfaces get this data from the case APIs.

export const evidenceById = new Map(
  demoDataset.evidence.map((item) => [item.id, item]),
);

export const entityById = new Map(
  demoDataset.entities.map((entity) => [entity.id, entity]),
);

export const eventById = new Map(
  demoDataset.events.map((event) => [event.id, event]),
);

export function SourceList({ sourceIds }: { sourceIds: string[] }) {
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

// A timestamp whose source only gave a date renders as a day span, never a
// fabricated midnight instant (timeline.md §4).
export function isDateOnly(iso: string): boolean {
  return iso.endsWith("T00:00:00Z");
}

export function formatTimestamp(iso: string): string {
  return isDateOnly(iso)
    ? `${new Date(iso).toLocaleDateString()} (date only)`
    : new Date(iso).toLocaleString();
}
