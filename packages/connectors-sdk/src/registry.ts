import type { ConnectorManifest } from "./index.js";
import { webPageCaptureManifest } from "./web-page-capture/manifest.js";

// The manifests of every built-in connector. The API serves and validates
// against these; the worker dispatches execution by key.
const MANIFESTS: readonly ConnectorManifest[] = [webPageCaptureManifest];

export function listConnectorManifests(): readonly ConnectorManifest[] {
  return MANIFESTS;
}

export function getConnectorManifest(
  key: string,
): ConnectorManifest | undefined {
  return MANIFESTS.find((manifest) => manifest.key === key);
}
