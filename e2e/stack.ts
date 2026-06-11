// Ports and fixtures shared by the global setup and the tests. The API must
// listen on 4000: `next build` bakes the /v1 rewrite destination
// (next.config.ts, default http://localhost:4000) into the production build,
// so a runtime API_URL cannot move it. The web port is dedicated so the suite
// does not clash with a running dev web server; stop a dev API before running.
export const API_PORT = 4000;
export const WEB_PORT = 3010;
export const FIXTURE_PORT = 4123;

export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}`;

// The capture target uses a hostname (not an IP literal) so it passes the
// API's static submission checks; the worker exempts it from address
// classification through CAPTURE_FIXTURE_ALLOWLIST.
export const FIXTURE_PAGE_URL = `http://localhost:${FIXTURE_PORT}/page`;

export const FIXTURE_PAGE_TITLE = "E2E fixture capture page";

export const FIXTURE_PAGE_BODY = [
  "<!doctype html>",
  "<html>",
  `<head><title>${FIXTURE_PAGE_TITLE}</title></head>`,
  "<body>",
  "<h1>Fixture heading</h1>",
  "<p>End-to-end capture fixture body. Served only on localhost.</p>",
  "</body>",
  "</html>",
].join("\n");
