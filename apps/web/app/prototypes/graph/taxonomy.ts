import type { EntityType } from "@evidara/ontology";

// Visual taxonomy from docs/design/graph.md §3: category carries color and
// shape, type carries a glyph. Colors are proposed --graph-cat-* tokens;
// they stay prototype-local until the feature milestone promotes them.

export type GraphCategory =
  | "people"
  | "organizations"
  | "infrastructure"
  | "content"
  | "assertions"
  | "places"
  | "evidence";

export const CATEGORY_OF: Record<EntityType, GraphCategory> = {
  PERSON: "people",
  ORGANIZATION: "organizations",
  ACCOUNT: "infrastructure",
  DOMAIN: "infrastructure",
  IP_ADDRESS: "infrastructure",
  URL: "infrastructure",
  EMAIL: "infrastructure",
  PHONE_NUMBER: "infrastructure",
  LOCATION: "places",
  EVENT: "places",
  DOCUMENT: "content",
  IMAGE: "content",
  CLAIM: "assertions",
  ASSET: "organizations",
  SOURCE: "evidence",
  EVIDENCE_ITEM: "evidence",
};

export const CATEGORY_LABELS: Record<GraphCategory, string> = {
  people: "People",
  organizations: "Organizations and assets",
  infrastructure: "Infrastructure",
  content: "Content",
  assertions: "Claims",
  places: "Places and events",
  evidence: "Evidence and sources",
};

export const CATEGORY_COLORS: Record<GraphCategory, string> = {
  people: "#e0a458",
  organizations: "#7fb3e0",
  infrastructure: "#9a8fe8",
  content: "#6ec9b8",
  assertions: "#e08585",
  places: "#a3c66f",
  evidence: "#b9b3a4",
};

export const TYPE_GLYPHS: Record<EntityType, string> = {
  PERSON: "P",
  ORGANIZATION: "O",
  ACCOUNT: "A",
  DOMAIN: "D",
  IP_ADDRESS: "IP",
  URL: "U",
  EMAIL: "@",
  PHONE_NUMBER: "T",
  LOCATION: "L",
  EVENT: "E",
  DOCUMENT: "F",
  IMAGE: "IM",
  CLAIM: "C",
  ASSET: "AS",
  SOURCE: "S",
  EVIDENCE_ITEM: "EV",
};

export const ALL_CATEGORIES: GraphCategory[] = [
  "people",
  "organizations",
  "infrastructure",
  "content",
  "assertions",
  "places",
  "evidence",
];

// Confidence renders as fill opacity plus the numeric value — opacity is a
// hint, never the record (graph.md §3).
export function confidenceOpacity(confidence: number): number {
  if (confidence >= 0.9) return 1;
  if (confidence >= 0.7) return 0.85;
  if (confidence >= 0.5) return 0.65;
  if (confidence >= 0.3) return 0.5;
  return 0.35;
}

export function edgeDash(confidence: number): string | undefined {
  if (confidence >= 0.7) return undefined;
  if (confidence >= 0.4) return "6 4";
  return "2 4";
}

// One shape per category, centered on (0,0), sized to radius r.
export function shapePath(category: GraphCategory, r: number): string {
  switch (category) {
    case "people":
      return `M ${-r},0 a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0`;
    case "organizations":
      return `M ${-r},${-r} h ${2 * r} v ${2 * r} h ${-2 * r} Z`;
    case "infrastructure":
      return `M 0,${-r} L ${r},0 L 0,${r} L ${-r},0 Z`;
    case "content":
      // Document: square with a notched top-right corner.
      return `M ${-r},${-r} h ${1.2 * r} l ${0.8 * r},${0.8 * r} v ${1.2 * r} h ${-2 * r} Z`;
    case "assertions": {
      const a = r * 0.866;
      return `M ${-r / 2},${-a} h ${r} L ${r},0 L ${r / 2},${a} h ${-r} L ${-r},0 Z`;
    }
    case "places":
      return `M 0,${-r} L ${r},${r * 0.9} h ${-2 * r} Z`;
    case "evidence":
      return `M 0,${-r} L ${r},${-r * 0.2} L ${r * 0.6},${r} h ${-1.2 * r} L ${-r},${-r * 0.2} Z`;
  }
}
