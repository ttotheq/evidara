import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import {
  CaptureError,
  type CaptureOptions,
  captureWebPage,
} from "../src/web-page-capture/capture.js";

type Handler = Parameters<typeof createServer>[1];

const servers: Server[] = [];

async function startFixture(handler: Handler): Promise<{
  origin: string;
  hostPort: string;
}> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    hostPort: `127.0.0.1:${port}`,
  };
}

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

function optionsFor(
  allowedHosts: string[],
  overrides: Partial<CaptureOptions> = {},
): CaptureOptions {
  return {
    maxRedirects: 3,
    maxResponseBytes: 64 * 1024,
    maxDecompressedBytes: 256 * 1024,
    timeoutMs: 5000,
    allowedContentTypes: ["text/html", "application/xhtml+xml", "text/plain"],
    userAgent: "EvidaraCaptureTest/0.1",
    allowedHosts,
    ...overrides,
  };
}

async function expectCaptureError(
  promise: Promise<unknown>,
): Promise<CaptureError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CaptureError);
    return error as CaptureError;
  }
  throw new Error("expected the capture to fail");
}

describe("captureWebPage target blocking", () => {
  it("blocks loopback, private, link-local, and metadata literals", async () => {
    for (const target of [
      "http://127.0.0.1/",
      "http://10.0.0.1/",
      "http://192.168.1.10/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[fd00::1]/",
    ]) {
      const error = await expectCaptureError(
        captureWebPage(target, optionsFor([])),
      );
      expect(error.code).toBe("BLOCKED_TARGET");
      expect(error.retryable).toBe(false);
    }
  });

  it("blocks hostnames that resolve to blocked addresses", async () => {
    // "localhost" resolves through real DNS lookup to loopback.
    const error = await expectCaptureError(
      captureWebPage("http://localhost:9999/", optionsFor([])),
    );
    expect(error.code).toBe("BLOCKED_TARGET");
  });

  it("rejects unsupported schemes and invalid URLs", async () => {
    expect(
      (
        await expectCaptureError(
          captureWebPage("ftp://example.com/", optionsFor([])),
        )
      ).code,
    ).toBe("UNSUPPORTED_SCHEME");
    expect(
      (await expectCaptureError(captureWebPage("%%%", optionsFor([])))).code,
    ).toBe("INVALID_URL");
  });

  it("fails with DNS_FAILURE for unresolvable hosts", async () => {
    const error = await expectCaptureError(
      captureWebPage(
        "http://definitely-not-a-real-host.invalid/",
        optionsFor([]),
      ),
    );
    expect(error.code).toBe("DNS_FAILURE");
    expect(error.retryable).toBe(true);
  });
});

describe("captureWebPage with fixture servers", () => {
  it("captures a page with provenance, title, text, and sanitized headers", async () => {
    const html = `<!doctype html>
      <html><head>
        <title>Fixture Page</title>
        <link rel="canonical" href="/canonical">
        <script>document.cookie = "spy=1";</script>
      </head>
      <body><h1>Visible heading</h1><p>Body &amp; text.</p></body></html>`;
    const fixture = await startFixture((_request, response) => {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "set-cookie": "session=secret",
        "x-fixture": "yes",
      });
      response.end(html);
    });

    const capture = await captureWebPage(
      `${fixture.origin}/page`,
      optionsFor([fixture.hostPort]),
    );

    expect(capture.status).toBe(200);
    expect(capture.requestedUrl).toBe(`${fixture.origin}/page`);
    expect(capture.finalUrl).toBe(`${fixture.origin}/page`);
    expect(capture.canonicalUrl).toBe(`${fixture.origin}/canonical`);
    expect(capture.title).toBe("Fixture Page");
    expect(capture.body.toString("utf8")).toBe(html);
    expect(capture.extractedText).toContain("Visible heading");
    expect(capture.extractedText).toContain("Body & text.");
    expect(capture.extractedText).not.toContain("document.cookie");
    expect(capture.headers["set-cookie"]).toBeUndefined();
    expect(capture.headers["x-fixture"]).toBe("yes");
    expect(capture.redirectChain).toEqual([]);
    expect(Date.parse(capture.fetchedAt)).not.toBeNaN();
  });

  it("follows redirects with revalidation and records the chain", async () => {
    const destination = await startFixture((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<title>Destination</title>");
    });
    const origin = await startFixture((_request, response) => {
      response.writeHead(302, { location: `${destination.origin}/landed` });
      response.end();
    });

    const capture = await captureWebPage(
      `${origin.origin}/start`,
      optionsFor([origin.hostPort, destination.hostPort]),
    );
    expect(capture.finalUrl).toBe(`${destination.origin}/landed`);
    expect(capture.redirectChain).toEqual([`${origin.origin}/start`]);
    expect(capture.title).toBe("Destination");
  });

  it("blocks redirects to unsafe targets", async () => {
    const fixture = await startFixture((_request, response) => {
      response.writeHead(302, {
        location: "http://169.254.169.254/latest/meta-data/",
      });
      response.end();
    });
    const error = await expectCaptureError(
      captureWebPage(`${fixture.origin}/`, optionsFor([fixture.hostPort])),
    );
    expect(error.code).toBe("BLOCKED_TARGET");
  });

  it("stops redirect loops with TOO_MANY_REDIRECTS", async () => {
    const fixture = await startFixture((request, response) => {
      response.writeHead(302, { location: `/loop${request.url}` });
      response.end();
    });
    const error = await expectCaptureError(
      captureWebPage(`${fixture.origin}/`, optionsFor([fixture.hostPort])),
    );
    expect(error.code).toBe("TOO_MANY_REDIRECTS");
  });

  it("rejects oversized responses", async () => {
    const fixture = await startFixture((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("x".repeat(128 * 1024));
    });
    const error = await expectCaptureError(
      captureWebPage(`${fixture.origin}/`, optionsFor([fixture.hostPort])),
    );
    expect(error.code).toBe("RESPONSE_TOO_LARGE");
  });

  it("rejects gzip bodies whose decompressed size exceeds the limit", async () => {
    const bomb = gzipSync(Buffer.alloc(512 * 1024, "a"));
    const fixture = await startFixture((_request, response) => {
      response.writeHead(200, {
        "content-type": "text/html",
        "content-encoding": "gzip",
      });
      response.end(bomb);
    });
    const error = await expectCaptureError(
      captureWebPage(`${fixture.origin}/`, optionsFor([fixture.hostPort])),
    );
    expect(error.code).toBe("RESPONSE_TOO_LARGE");
  });

  it("decompresses small gzip responses", async () => {
    const html = "<title>Zipped</title><p>compressed body</p>";
    const fixture = await startFixture((_request, response) => {
      response.writeHead(200, {
        "content-type": "text/html",
        "content-encoding": "gzip",
      });
      response.end(gzipSync(Buffer.from(html)));
    });
    const capture = await captureWebPage(
      `${fixture.origin}/`,
      optionsFor([fixture.hostPort]),
    );
    expect(capture.title).toBe("Zipped");
    expect(capture.body.toString("utf8")).toBe(html);
  });

  it("rejects unsupported content types", async () => {
    const fixture = await startFixture((_request, response) => {
      response.writeHead(200, { "content-type": "image/png" });
      response.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    const error = await expectCaptureError(
      captureWebPage(`${fixture.origin}/`, optionsFor([fixture.hostPort])),
    );
    expect(error.code).toBe("UNSUPPORTED_CONTENT_TYPE");
  });

  it("classifies HTTP errors with retryability", async () => {
    const fixture = await startFixture((request, response) => {
      response.writeHead(request.url === "/500" ? 500 : 404);
      response.end();
    });
    const serverError = await expectCaptureError(
      captureWebPage(`${fixture.origin}/500`, optionsFor([fixture.hostPort])),
    );
    expect(serverError.code).toBe("HTTP_ERROR");
    expect(serverError.retryable).toBe(true);

    const notFound = await expectCaptureError(
      captureWebPage(`${fixture.origin}/404`, optionsFor([fixture.hostPort])),
    );
    expect(notFound.code).toBe("HTTP_ERROR");
    expect(notFound.retryable).toBe(false);
  });

  it("rejects empty response bodies", async () => {
    const fixture = await startFixture((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end();
    });
    const error = await expectCaptureError(
      captureWebPage(`${fixture.origin}/`, optionsFor([fixture.hostPort])),
    );
    expect(error.code).toBe("EMPTY_RESPONSE");
  });

  it("times out slow responses as retryable", async () => {
    const fixture = await startFixture((_request, response) => {
      // Headers sent, body intentionally never completed.
      response.writeHead(200, { "content-type": "text/html" });
      response.write("<html>");
    });
    const error = await expectCaptureError(
      captureWebPage(
        `${fixture.origin}/`,
        optionsFor([fixture.hostPort], { timeoutMs: 500 }),
      ),
    );
    expect(error.code).toBe("TIMEOUT");
    expect(error.retryable).toBe(true);
  });

  it("captures text/plain without HTML extraction", async () => {
    const fixture = await startFixture((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("plain text content");
    });
    const capture = await captureWebPage(
      `${fixture.origin}/`,
      optionsFor([fixture.hostPort]),
    );
    expect(capture.title).toBeNull();
    expect(capture.extractedText).toBe("plain text content");
  });

  it("reports progress through the callback", async () => {
    const fixture = await startFixture((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<title>Progress</title>");
    });
    const messages: string[] = [];
    await captureWebPage(`${fixture.origin}/`, {
      ...optionsFor([fixture.hostPort]),
      onProgress: (_percent, message) => {
        messages.push(message);
      },
    });
    expect(messages).toContain("Validating target");
    expect(messages).toContain("Downloading content");
  });
});
