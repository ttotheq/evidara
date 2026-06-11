import { lookup } from "node:dns/promises";
import {
  brotliDecompress,
  gunzip,
  inflate,
  constants as zlibConstants,
} from "node:zlib";
import { promisify } from "node:util";
import { Agent, request } from "undici";
import {
  classifyAddress,
  isIpLiteral,
  normalizeTargetUrl,
} from "./url-policy.js";
import {
  extractCanonicalUrl,
  extractReadableText,
  extractTitle,
} from "./extract-text.js";

const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);
const brotliAsync = promisify(brotliDecompress);

export type CaptureErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_SCHEME"
  | "BLOCKED_TARGET"
  | "DNS_FAILURE"
  | "CONNECTION_FAILED"
  | "TIMEOUT"
  | "CANCELLED"
  | "TOO_MANY_REDIRECTS"
  | "RESPONSE_TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "UNSUPPORTED_ENCODING"
  | "DECODE_FAILED"
  | "HTTP_ERROR"
  | "EMPTY_RESPONSE";

// Stable, operator-safe failure descriptions. The message never embeds
// resolved addresses or response content.
export class CaptureError extends Error {
  readonly code: CaptureErrorCode;
  readonly retryable: boolean;

  constructor(code: CaptureErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "CaptureError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface CaptureOptions {
  maxRedirects: number;
  maxResponseBytes: number;
  maxDecompressedBytes: number;
  timeoutMs: number;
  allowedContentTypes: string[];
  userAgent: string;
  // Exact "hostname:port" entries exempt from address classification.
  // Intended only for local test fixture servers; never enable in production.
  allowedHosts?: string[];
  signal?: AbortSignal;
  onProgress?: (percent: number, message: string) => Promise<void> | void;
}

export interface WebPageCapture {
  requestedUrl: string;
  finalUrl: string;
  canonicalUrl: string | null;
  redirectChain: string[];
  status: number;
  headers: Record<string, string>;
  contentType: string;
  body: Buffer;
  title: string | null;
  extractedText: string;
  fetchedAt: string;
  durationMs: number;
  userAgent: string;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_RESPONSE_HEADERS = new Set(["set-cookie", "set-cookie2"]);

function effectivePort(url: URL): string {
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

function isAllowlistedHost(url: URL, allowedHosts: string[]): boolean {
  return allowedHosts.includes(`${url.hostname}:${effectivePort(url)}`);
}

interface ResolvedAddress {
  address: string;
  family: number;
}

// Resolves the target and classifies every returned address. The validated
// set is then pinned to the socket connection, so a later DNS change
// (rebinding) cannot redirect the request to a blocked network.
async function resolveAndValidate(
  url: URL,
  allowedHosts: string[],
): Promise<ResolvedAddress[]> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const allowlisted = isAllowlistedHost(url, allowedHosts);

  if (isIpLiteral(hostname)) {
    const verdict = classifyAddress(hostname);
    if (verdict.blocked && !allowlisted) {
      throw new CaptureError(
        "BLOCKED_TARGET",
        `The target resolves to a ${verdict.category} address, which is not allowed.`,
      );
    }
    return [{ address: hostname, family: hostname.includes(":") ? 6 : 4 }];
  }

  let records: { address: string; family: number }[];
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    throw new CaptureError(
      "DNS_FAILURE",
      "The target hostname could not be resolved.",
      true,
    );
  }
  if (records.length === 0) {
    throw new CaptureError(
      "DNS_FAILURE",
      "The target hostname has no addresses.",
      true,
    );
  }
  for (const record of records) {
    const verdict = classifyAddress(record.address);
    if (verdict.blocked && !allowlisted) {
      throw new CaptureError(
        "BLOCKED_TARGET",
        `The target resolves to a ${verdict.category} address, which is not allowed.`,
      );
    }
  }
  return records;
}

// An agent whose connections may only use the pre-validated addresses.
function pinnedAgent(addresses: ResolvedAddress[]): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        const first = addresses[0];
        if (!first) {
          callback(new Error("no pinned address"), "", 4);
          return;
        }
        if (
          (options as { all?: boolean }).all &&
          typeof callback === "function"
        ) {
          (callback as unknown as (
            error: Error | null,
            result: { address: string; family: number }[],
          ) => void)(null, addresses);
          return;
        }
        callback(null, first.address, first.family);
      },
    },
  });
}

function sanitizeHeaders(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    const lower = name.toLowerCase();
    if (BLOCKED_RESPONSE_HEADERS.has(lower) || value === undefined) continue;
    headers[lower] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}

async function readBodyCapped(
  body: AsyncIterable<Buffer>,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new CaptureError(
        "RESPONSE_TOO_LARGE",
        `The response exceeds the ${maxBytes} byte capture limit.`,
      );
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function decodeBody(
  body: Buffer,
  contentEncoding: string | undefined,
  maxDecompressedBytes: number,
): Promise<Buffer> {
  const encoding = (contentEncoding ?? "identity").trim().toLowerCase();
  const zlibOptions = {
    maxOutputLength: maxDecompressedBytes,
    finishFlush: zlibConstants.Z_SYNC_FLUSH,
  };
  try {
    switch (encoding) {
      case "identity":
      case "":
        return body;
      case "gzip":
      case "x-gzip":
        return await gunzipAsync(body, zlibOptions);
      case "deflate":
        return await inflateAsync(body, zlibOptions);
      case "br":
        return await brotliAsync(body, {
          maxOutputLength: maxDecompressedBytes,
        });
      default:
        throw new CaptureError(
          "UNSUPPORTED_ENCODING",
          `Content encoding "${encoding}" is not supported.`,
        );
    }
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    if (
      error instanceof RangeError ||
      (error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE"
    ) {
      throw new CaptureError(
        "RESPONSE_TOO_LARGE",
        "The decompressed response exceeds the capture limit.",
      );
    }
    throw new CaptureError(
      "DECODE_FAILED",
      "The response body could not be decoded.",
    );
  }
}

function combinedSignal(
  deadlineMs: number,
  external?: AbortSignal,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(Math.max(deadlineMs, 1));
  return external
    ? AbortSignal.any([external, timeoutSignal])
    : timeoutSignal;
}

// Captures a single web page over http(s) without executing page JavaScript.
// Every hop — the initial request and each redirect — re-normalizes the URL,
// re-resolves DNS, classifies all addresses, and pins the connection to the
// validated set.
export async function captureWebPage(
  rawUrl: string,
  options: CaptureOptions,
): Promise<WebPageCapture> {
  const startedAt = Date.now();
  const deadline = startedAt + options.timeoutMs;
  const allowedHosts = options.allowedHosts ?? [];
  const redirectChain: string[] = [];

  const initial = normalizeTargetUrl(rawUrl);
  if (!initial.ok) {
    throw new CaptureError(initial.errorCode, initial.reason);
  }
  let currentUrl = initial.url;

  for (let hop = 0; hop <= options.maxRedirects; hop += 1) {
    await options.onProgress?.(
      Math.min(10 + hop * 10, 40),
      hop === 0 ? "Validating target" : `Following redirect ${hop}`,
    );
    const addresses = await resolveAndValidate(currentUrl, allowedHosts);
    const agent = pinnedAgent(addresses);

    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(currentUrl, {
        method: "GET",
        dispatcher: agent,
        signal: combinedSignal(deadline - Date.now(), options.signal),
        headers: {
          "user-agent": options.userAgent,
          accept:
            "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.1",
          "accept-encoding": "identity",
        },
      });
    } catch (error) {
      await agent.close().catch(() => undefined);
      if (options.signal?.aborted) {
        throw new CaptureError("CANCELLED", "The capture was cancelled.");
      }
      if ((error as Error).name === "AbortError" || Date.now() >= deadline) {
        throw new CaptureError(
          "TIMEOUT",
          "The capture did not complete within the allowed time.",
          true,
        );
      }
      throw new CaptureError(
        "CONNECTION_FAILED",
        "The target could not be reached.",
        true,
      );
    }

    try {
      if (REDIRECT_STATUSES.has(response.statusCode)) {
        const location = response.headers["location"];
        await response.body.dump();
        const locationValue = Array.isArray(location) ? location[0] : location;
        if (!locationValue) {
          throw new CaptureError(
            "HTTP_ERROR",
            `The target responded with a redirect (${response.statusCode}) without a location.`,
          );
        }
        if (hop === options.maxRedirects) {
          throw new CaptureError(
            "TOO_MANY_REDIRECTS",
            `The target redirected more than ${options.maxRedirects} times.`,
          );
        }
        let nextRaw: string;
        try {
          nextRaw = new URL(locationValue, currentUrl).toString();
        } catch {
          throw new CaptureError(
            "INVALID_URL",
            "The target redirected to an invalid URL.",
          );
        }
        const next = normalizeTargetUrl(nextRaw);
        if (!next.ok) {
          throw new CaptureError(next.errorCode, next.reason);
        }
        redirectChain.push(currentUrl.toString());
        currentUrl = next.url;
        continue;
      }

      if (response.statusCode >= 400) {
        await response.body.dump();
        const retryable =
          response.statusCode === 408 ||
          response.statusCode === 425 ||
          response.statusCode === 429 ||
          response.statusCode >= 500;
        throw new CaptureError(
          "HTTP_ERROR",
          `The target responded with HTTP ${response.statusCode}.`,
          retryable,
        );
      }

      const headers = sanitizeHeaders(response.headers);
      const contentType = (headers["content-type"] ?? "")
        .split(";")[0]
        ?.trim()
        .toLowerCase();
      if (
        !contentType ||
        !options.allowedContentTypes.includes(contentType)
      ) {
        await response.body.dump();
        throw new CaptureError(
          "UNSUPPORTED_CONTENT_TYPE",
          `Content type "${contentType || "unknown"}" is not supported for capture.`,
        );
      }

      await options.onProgress?.(60, "Downloading content");
      const rawBody = await readBodyCapped(
        response.body,
        options.maxResponseBytes,
      );
      const body = await decodeBody(
        rawBody,
        headers["content-encoding"],
        options.maxDecompressedBytes,
      );
      if (body.length === 0) {
        throw new CaptureError(
          "EMPTY_RESPONSE",
          "The target returned an empty response body.",
        );
      }

      await options.onProgress?.(80, "Extracting readable text");
      const html = body.toString("utf8");
      const isHtml = contentType !== "text/plain";
      const finalUrl = currentUrl.toString();

      return {
        requestedUrl: initial.url.toString(),
        finalUrl,
        canonicalUrl: isHtml ? extractCanonicalUrl(html, finalUrl) : null,
        redirectChain,
        status: response.statusCode,
        headers,
        contentType,
        body,
        title: isHtml ? extractTitle(html) : null,
        extractedText: isHtml ? extractReadableText(html) : html,
        fetchedAt: new Date(startedAt).toISOString(),
        durationMs: Date.now() - startedAt,
        userAgent: options.userAgent,
      };
    } catch (error) {
      if (
        error instanceof CaptureError ||
        !(options.signal?.aborted || Date.now() >= deadline)
      ) {
        throw error;
      }
      throw options.signal?.aborted
        ? new CaptureError("CANCELLED", "The capture was cancelled.")
        : new CaptureError(
            "TIMEOUT",
            "The capture did not complete within the allowed time.",
            true,
          );
    } finally {
      await agent.close().catch(() => undefined);
    }
  }

  throw new CaptureError(
    "TOO_MANY_REDIRECTS",
    `The target redirected more than ${options.maxRedirects} times.`,
  );
}
