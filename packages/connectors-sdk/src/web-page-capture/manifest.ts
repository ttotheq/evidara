import { z } from "zod";
import type { ConnectorManifest } from "../index.js";

export const webPageCaptureInputSchema = z.object({
  url: z.string().trim().min(1).max(2048),
});

export type WebPageCaptureInput = z.infer<typeof webPageCaptureInputSchema>;

export const WEB_PAGE_CAPTURE_KEY = "web-page-capture";
export const WEB_PAGE_CAPTURE_VERSION = "1.0.0";

export const webPageCaptureManifest: ConnectorManifest<
  typeof webPageCaptureInputSchema
> = {
  key: WEB_PAGE_CAPTURE_KEY,
  name: "Web page capture",
  version: WEB_PAGE_CAPTURE_VERSION,
  description:
    "Captures a single public web page over http(s): raw response bytes, " +
    "extracted readable text, and full provenance. Loopback, private, " +
    "link-local, multicast, reserved, and cloud-metadata targets are " +
    "blocked, redirects are re-validated, and page JavaScript never runs.",
  source: "public-web",
  method: "http-get",
  safetyClass: "LOW",
  rateLimit: { requests: 30, windowSeconds: 60 },
  inputSchema: webPageCaptureInputSchema,
};
