import type { Readable } from "node:stream";
import type { z } from "zod";

export type SafetyClass = "LOW" | "MODERATE" | "HIGH";

export interface ConnectorManifest<TInput extends z.ZodType = z.ZodType> {
  key: string;
  name: string;
  version: string;
  description: string;
  source: string;
  method: string;
  termsUrl?: string;
  licenseNotes?: string;
  safetyClass: SafetyClass;
  rateLimit: {
    requests: number;
    windowSeconds: number;
  };
  inputSchema: TInput;
}

export interface ConnectorContext {
  caseId: string;
  jobId: string;
  signal: AbortSignal;
  fetch: typeof fetch;
  emitProgress(percent: number, message: string): Promise<void>;
}

export interface ConnectorArtifact {
  filename: string;
  mediaType: string;
  stream: Readable;
}

export interface ConnectorResult {
  raw: unknown;
  normalized: Record<string, unknown>[];
  artifacts?: ConnectorArtifact[];
  observedAt: Date;
  sourceUrl?: string;
}

export interface Connector<TInput extends z.ZodType = z.ZodType> {
  manifest: ConnectorManifest<TInput>;
  run(
    input: z.infer<TInput>,
    context: ConnectorContext,
  ): Promise<ConnectorResult>;
}

