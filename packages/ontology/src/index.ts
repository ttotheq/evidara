export const entityTypes = [
  "PERSON",
  "ORGANIZATION",
  "ACCOUNT",
  "DOMAIN",
  "IP_ADDRESS",
  "URL",
  "EMAIL",
  "PHONE_NUMBER",
  "LOCATION",
  "EVENT",
  "DOCUMENT",
  "IMAGE",
  "CLAIM",
  "ASSET",
  "SOURCE",
  "EVIDENCE_ITEM",
] as const;

export const relationTypes = [
  "OWNS",
  "OPERATES",
  "MENTIONED_IN",
  "OBSERVED_AT",
  "LINKED_TO",
  "RESOLVED_TO",
  "REGISTERED_BY",
  "AFFILIATED_WITH",
  "LOCATED_AT",
  "CLAIMS",
  "CONTRADICTS",
  "SUPPORTS",
  "DERIVED_FROM",
] as const;

export type EntityType = (typeof entityTypes)[number];
export type RelationType = (typeof relationTypes)[number];

export interface OntologyRule {
  relation: RelationType;
  from: readonly EntityType[];
  to: readonly EntityType[];
  symmetric?: boolean;
}

export const ontologyRules: readonly OntologyRule[] = [
  {
    relation: "RESOLVED_TO",
    from: ["DOMAIN"],
    to: ["IP_ADDRESS"],
  },
  {
    relation: "CONTRADICTS",
    from: ["CLAIM", "EVIDENCE_ITEM"],
    to: ["CLAIM", "EVIDENCE_ITEM"],
    symmetric: true,
  },
  {
    relation: "SUPPORTS",
    from: ["EVIDENCE_ITEM", "CLAIM"],
    to: ["CLAIM"],
  },
];
