import { entityTypes, ontologyRules, relationTypes } from "@evidara/ontology";
import { demoDataset } from "./dataset";
import type { DemoDataset } from "./types";

export type {
  DemoDataset,
  DemoEntity,
  DemoEvent,
  DemoEvidence,
  DemoLocation,
  DemoRelation,
} from "./types";
export { demoDataset };

// The fixtures are design infrastructure for the prototype routes; a broken
// reference would silently produce a misleading prototype. Validation runs
// once at import in development and test builds and is compiled out of
// production (where the dataset is never imported anyway).
export function validateDemoDataset(dataset: DemoDataset): string[] {
  const problems: string[] = [];
  const entityIds = new Set(dataset.entities.map((entity) => entity.id));
  const evidenceIds = new Set(dataset.evidence.map((item) => item.id));
  const eventIds = new Set(dataset.events.map((event) => event.id));
  const entityById = new Map(
    dataset.entities.map((entity) => [entity.id, entity]),
  );

  function uniqueIds(kind: string, ids: string[]) {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`duplicate ${kind} id: ${id}`);
      seen.add(id);
    }
  }
  uniqueIds(
    "entity",
    dataset.entities.map((entity) => entity.id),
  );
  uniqueIds(
    "relation",
    dataset.relations.map((relation) => relation.id),
  );
  uniqueIds(
    "event",
    dataset.events.map((event) => event.id),
  );
  uniqueIds(
    "location",
    dataset.locations.map((location) => location.id),
  );
  uniqueIds(
    "evidence",
    dataset.evidence.map((item) => item.id),
  );

  function checkSources(owner: string, sourceIds: string[]) {
    if (sourceIds.length === 0) problems.push(`${owner} has no sources`);
    for (const id of sourceIds) {
      if (!evidenceIds.has(id)) problems.push(`${owner} cites unknown ${id}`);
    }
  }

  for (const entity of dataset.entities) {
    checkSources(`entity ${entity.id}`, entity.sourceIds);
    if (entity.confidence < 0 || entity.confidence > 1) {
      problems.push(`entity ${entity.id} confidence out of range`);
    }
  }

  for (const relation of dataset.relations) {
    if (!entityIds.has(relation.fromId)) {
      problems.push(`relation ${relation.id} from unknown ${relation.fromId}`);
    }
    if (!entityIds.has(relation.toId)) {
      problems.push(`relation ${relation.id} to unknown ${relation.toId}`);
    }
    checkSources(`relation ${relation.id}`, relation.sourceIds);

    const rule = ontologyRules.find(
      (candidate) => candidate.relation === relation.type,
    );
    const from = entityById.get(relation.fromId);
    const to = entityById.get(relation.toId);
    if (rule && from && to) {
      const forward =
        rule.from.includes(from.type) && rule.to.includes(to.type);
      const reverse =
        rule.symmetric === true &&
        rule.from.includes(to.type) &&
        rule.to.includes(from.type);
      if (!forward && !reverse) {
        problems.push(
          `relation ${relation.id} (${relation.type}) violates ontology rule: ${from.type} -> ${to.type}`,
        );
      }
    }
  }

  for (const event of dataset.events) {
    checkSources(`event ${event.id}`, event.sourceIds);
    for (const id of event.entityIds) {
      if (!entityIds.has(id)) {
        problems.push(`event ${event.id} references unknown entity ${id}`);
      }
    }
  }

  for (const location of dataset.locations) {
    for (const id of location.entityIds) {
      if (!entityIds.has(id)) {
        problems.push(
          `location ${location.id} references unknown entity ${id}`,
        );
      }
    }
    for (const id of location.eventIds) {
      if (!eventIds.has(id)) {
        problems.push(`location ${location.id} references unknown event ${id}`);
      }
    }
  }

  const presentEntityTypes = new Set(
    dataset.entities.map((entity) => entity.type),
  );
  for (const type of entityTypes) {
    if (!presentEntityTypes.has(type)) {
      problems.push(`no entity of type ${type}`);
    }
  }
  const presentRelationTypes = new Set(
    dataset.relations.map((relation) => relation.type),
  );
  for (const type of relationTypes) {
    if (!presentRelationTypes.has(type)) {
      problems.push(`no relation of type ${type}`);
    }
  }

  const minimums: Array<[string, number, number]> = [
    ["entities", dataset.entities.length, 50],
    ["relations", dataset.relations.length, 80],
    ["events", dataset.events.length, 30],
    ["locations", dataset.locations.length, 15],
  ];
  for (const [name, actual, minimum] of minimums) {
    if (actual < minimum) {
      problems.push(`${name}: ${actual} < required ${minimum}`);
    }
  }

  return problems;
}

if (process.env.NODE_ENV !== "production") {
  const problems = validateDemoDataset(demoDataset);
  if (problems.length > 0) {
    throw new Error(`Demo dataset is inconsistent:\n${problems.join("\n")}`);
  }
}
