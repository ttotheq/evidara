# Web Capture: Security Assumptions and Responsible Use

This document covers the `web-page-capture` connector delivered in the first
usable vertical slice. It states what the connector does, the threat model it
defends against, the assumptions a deployment must uphold, and the boundaries
of responsible use.

## What the connector does

- Fetches a single page over `http` or `https` only, with an identifiable
  user agent (`CAPTURE_USER_AGENT`).
- Stores the raw response bytes unchanged as immutable evidence, plus
  extracted readable text, the response status and sanitized headers
  (`set-cookie` is dropped), the requested/final/canonical URLs, the full
  redirect chain, timestamps, duration, SHA-256, and connector version.
- Never executes page JavaScript and never renders the page; the capture is
  a plain HTTP client, not a browser.
- Sends no credentials, no cookies, and no analyst-identifying data to the
  target.

## Server-side request forgery (SSRF) defenses

The capture worker fetches attacker-influencable URLs from inside the
deployment network, so SSRF is the primary threat. Enforcement is layered;
the worker is authoritative.

**At submission (API).** Statically checkable problems are rejected
immediately with `INVALID_TARGET`: non-http(s) schemes, embedded
credentials, and IP-literal hosts in a blocked class — including hex, octal,
and integer IPv4 spellings, which are canonicalized by the WHATWG URL parser
before classification.

**At execution (worker).** For the initial URL and again for every redirect
hop, the worker re-normalizes the URL, resolves DNS, and classifies every
returned IPv4 and IPv6 address. A target is fetched only if all of its
addresses are publicly routable. Blocked classes: loopback, RFC 1918
private, link-local (including the 169.254.169.254 cloud metadata service),
carrier-grade NAT (100.64/10), this-network, reserved, documentation,
multicast, and the IPv6 equivalents (unique-local, link-local, multicast),
plus IPv4 addresses embedded in NAT64, 6to4, and Teredo forms. Anything
unparseable fails closed.

**DNS-rebinding defense.** Connections are pinned: the worker connects only
to the exact addresses it validated, so a second resolution between check
and connect cannot redirect the request to an internal address.

**Resource limits.** Bounded redirects (`CAPTURE_MAX_REDIRECTS`, default 5),
response size (`CAPTURE_MAX_RESPONSE_BYTES`, default 10 MiB), decompressed
size (`CAPTURE_MAX_DECOMPRESSED_BYTES`, default 50 MiB — this is what stops
compression bombs), total duration (`CAPTURE_TIMEOUT_SECONDS`, default 30),
and a content-type allowlist (`CAPTURE_ALLOWED_CONTENT_TYPES`, default HTML,
XHTML, and plain text). Failures map to stable, safe error codes; raw
upstream error detail is never stored in evidence or audit metadata.

**Test fixture allowlist.** `CAPTURE_FIXTURE_ALLOWLIST` exempts exact
`host:port` entries from address classification so automated tests can
capture from local fixture servers. It is forced to empty when
`NODE_ENV=production`; it must never be used to reach internal services.

## Deployment assumptions

The application-level checks are necessary but are not a substitute for
network controls. A production deployment should also:

- Apply network-level egress policy to the connector worker (deny RFC 1918,
  link-local, and the metadata service at the firewall) as defense in depth.
- Point the worker at a trusted DNS resolver; the address classification is
  only as good as the answers the resolver returns.
- Keep the `CAPTURE_*` limits at or below the defaults unless there is a
  reviewed reason to raise them.
- Treat captured HTML as untrusted content. Evidara stores raw bytes and
  extracted text; anything that later renders captured HTML must sandbox it.

## Responsible use

Evidara records who queued every capture, against which case, with what
justification, and what came back — collection is attributable by design.
Operators and analysts remain responsible for using it lawfully:

- Capture only publicly accessible pages that are inside the case's declared
  scope and do not cross its prohibited-collection boundaries.
- No authenticated-area collection, no paywall or access-control
  circumvention, no covert collection. The connector sends no credentials by
  construction; do not work around that.
- The current connector does not evaluate `robots.txt` or site terms of
  service. Whether a capture is appropriate for a given source is a human
  decision that the case's scope and justification should document.
- The declared connector rate limit (30 requests per 60 seconds in the
  manifest) is published metadata and is not yet enforced by the worker; do
  not script bulk collection against a single source on the assumption that
  the platform will throttle it.

## Known gaps

Tracked as known limitations for future milestones: manifest rate limits are
not enforced; there is no screenshot capture (deliberately — a rendering
browser must not weaken the SSRF gate, per the delivery plan); robots.txt
and source-policy evaluation are not implemented; `nextRetryAt` exists in
the schema but automatic retries are disabled in favor of explicit, audited
retries.
