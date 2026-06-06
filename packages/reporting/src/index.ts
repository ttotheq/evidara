export interface CitationRef {
  evidenceId: string;
  locator?: string;
}

export type ReportBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string; citations: CitationRef[] }
  | { type: "finding"; findingId: string }
  | { type: "evidence-table"; evidenceIds: string[] }
  | { type: "page-break" };

export interface ReportDocument {
  title: string;
  methodology: string;
  confidenceRubric: string;
  blocks: ReportBlock[];
}

export interface ReportExporter {
  mediaType: string;
  export(document: ReportDocument): Promise<Uint8Array>;
}

