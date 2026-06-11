import type { EntityType, RelationType } from "@evidara/ontology";

// Fixture shapes for the design-milestone prototypes. These intentionally
// mirror the PRD's ontology requirements (source reference, confidence,
// handling level, timestamps) without proposing a database schema — the
// real schema is derived later from the Phase 4-6 interaction specs.

export type DemoHandlingLevel =
  | "PUBLIC"
  | "INTERNAL"
  | "SENSITIVE"
  | "RESTRICTED";

export interface DemoEntity {
  id: string;
  type: EntityType;
  label: string;
  summary: string;
  /** 0..1 analyst confidence that this entity is correctly identified. */
  confidence: number;
  handlingLevel: DemoHandlingLevel;
  /** Evidence stubs this entity is sourced from. Never empty. */
  sourceIds: string[];
  firstObserved: string;
  attributes?: Record<string, string>;
}

export interface DemoRelation {
  id: string;
  type: RelationType;
  fromId: string;
  toId: string;
  confidence: number;
  sourceIds: string[];
  note?: string;
}

export interface DemoEvent {
  id: string;
  label: string;
  summary: string;
  /** When it happened (event time). */
  occurredAt: string;
  /** When someone observed or published it, if different. */
  observedAt?: string;
  publishedAt?: string;
  /** When Evidara collected it. */
  collectedAt: string;
  entityIds: string[];
  sourceIds: string[];
}

export interface DemoLocation {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  precision: "exact" | "city" | "region";
  /** False models the geocoding-ambiguity state analysts must confirm. */
  geocodeConfirmed: boolean;
  entityIds: string[];
  eventIds: string[];
}

export interface DemoEvidence {
  id: string;
  title: string;
  kind: "WEB_CAPTURE" | "FILE" | "MANUAL";
  sourceUrl?: string;
  sha256: string;
  collectedAt: string;
  collectedBy: string;
  method: string;
  excerpt: string;
}

export interface DemoDataset {
  caseName: string;
  caseSummary: string;
  entities: DemoEntity[];
  relations: DemoRelation[];
  events: DemoEvent[];
  locations: DemoLocation[];
  evidence: DemoEvidence[];
}
