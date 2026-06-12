# Evidara Handoff

Date: 2026-06-10
Branch: `main` (renamed from `master` at the Phase 8 release gate; no remote configured yet)
Last commit at handoff: Phase 8 documentation and release gate (see `git log`)

## What this project is

Evidara is an open-source, evidence-centered OSINT investigation workspace
(TypeScript monorepo: Next.js web, Fastify API, BullMQ workers, PostgreSQL,
Redis, MinIO). The active milestone is the
[design milestone](plans/design-milestone.md) (tokens, components, and
interaction design for the post-slice surfaces); the completed
[first usable vertical slice](plans/first-usable-vertical-slice.md) precedes
it. **Where any other document disagrees with the active plan, the plan
wins.**

## Design milestone status: complete (7 of 7 phases)

| Phase | Scope | Status | Commit |
| --- | --- | --- | --- |
| 1 | Token foundation, dark + light themes, theme toggle | Done | `91a8f12` |
| 2 | Component catalog + dev-only /design-system styleguide | Done | `19aea18` |
| 3 | Synthetic demo dataset (typed fixtures, ontology-validated) | Done | `16c74af` |
| 4 | Entity graph interaction design + prototype | Done | `0453cb1` |
| 5 | Timeline and map interaction design + prototypes | Done | `5b74acd` |
| 6 | Notebook interaction design + prototype | Done | `9555ac0` |
| 7 | Synthesis and next-milestone input | Done | see `git log` |

`docs/design/README.md` is the index: token/component rules for feature
work, the shared surface conventions (the `?selected=` URL contract,
window-level Escape, equivalent table/list views, count lines, one action
to evidence), the decisions each feature milestone inherits (graph SVG
threshold; the four-timestamp model; **self-hosted map tiles only**;
ProseMirror for the notebook editor), and the build-order recommendation:
**graph + minimal entity extraction first**, then timeline and map as
projections over the same schema, then notebook with the editor adoption.
Four interaction specs pair with dev-only prototype routes
(`/prototypes/{graph,timeline,map,notebook}`, all 404 in production) on
the demo dataset. A scoped `biome.json` override disables two a11y rules
that false-positive on SVG composite widgets, prototypes only.

Decisions resolved in plan §3: prototypes are dev-only routes in the real
app; both themes ship with dark as default; the graph spec assumes SVG/DOM
rendering. Design references: `docs/design/tokens.md` (token set, WCAG
contrast matrix, audit decisions incl. deferred spacing normalization) and
`docs/design/components.md` (component catalog; no dead selectors, no
pixel-affecting consolidations). The demo dataset for Phases 4–6 lives in
`apps/web/lib/demo/` ("Berth 14 narrative network": 59 entities across all
16 ontology types, 80 relations across all 13 types, 30 events, 15
locations, 12 evidence stubs) — self-validating at import outside
production; consumed only by prototype routes. The `/design-system` route
and the demo fixtures are 404/absent in production builds.

## Vertical slice status: complete (8 of 8 phases)

| Phase | Scope | Status | Commit |
| --- | --- | --- | --- |
| 1 | Dev environment, initial migration, seed, readiness checks | Done | `733e64a` |
| 2 | Sessions, authentication, CSRF, central authorization | Done | `55a8b00` |
| 3 | Case workspace (case API + first real web UI) | Done | `b5d6b4f` |
| 4 | Evidence ingestion and source register | Done | `e87e1d6` |
| 5 | Secure web-page capture connector | Done | `f66f8e8` |
| 6 | Audit interfaces | Done | `b5e93a6` |
| 7 | Automated testing and CI | Done | `257c9b7` |
| 8 | Documentation and release gate | Done | see `git log` |

Each phase landed as one commit on a building, tested tree. Known
limitations at milestone close are recorded in the README ("Status and known
limitations"); web capture security assumptions live in
`docs/security/web-capture.md`.

**After Phase 8** (decided 2026-06-10): the next planning artifact is a
dedicated design milestone — formalize the CSS visual language into a
documented token/component system and do interaction design for the
post-slice surfaces (entity graph, timeline, map, notebook) — before any
further feature code. No formal visual design exists today; the de facto
design system is `apps/web/app/styles.css` plus the UX rules in
`docs/architecture/ui-architecture.md`. Do not insert design work into
phases 5–8; the remaining milestone UI (audit timeline)
composes from the existing visual vocabulary.

## Running it

```bash
cp .env.example .env        # replace session secret + seed owner password
npm install
npm run dev:infra           # postgres/redis/minio, waits for health checks
npm run dev:bootstrap       # migrations + evidence bucket + seed
npm run dev                 # api :4000, web :3000, both workers
```

Sign in at `http://localhost:3000/login` with the `SEED_OWNER_EMAIL` /
`SEED_OWNER_PASSWORD` values from `.env`. API readiness:
`GET :4000/health/ready` (checks postgres, redis, object storage).

Tests: `npm test` — 225 vitest tests total: 142 in `@evidara/api`
(unit + integration), 73 in `@evidara/connectors-sdk` (SSRF address
classification, capture behavior against local fixture HTTP servers, text
extraction), and 10 in `@evidara/connector-worker` (executing real
`web-page-capture` jobs end to end against a local fixture server, including
evidence/blob/audit writes to the test database and MinIO bucket, failure
classification, blob dedup, and a BullMQ queue round-trip). API integration
tests talk to the real test MinIO bucket (`evidara-evidence-test`, created
automatically by the global setup) and `.env.test` pins
`UPLOAD_MAX_BYTES=1024` so the size-limit test stays fast — keep test upload
fixtures under 1 KiB. The global setups also obliterate the test Redis queue
(`connector-jobs`, db 1) because API tests enqueue real entries that no
worker drains.
Integration tests auto-create an `evidara_test` database and apply migrations;
every global setup refuses any database whose name does not end in `_test`.
`pretest` hooks rebuild workspace packages first — do not remove them; the API
and worker resolve `@evidara/contracts` and `@evidara/database` from their
compiled `dist/`, and stale builds fail in confusing ways (validation silently
absent). `npm run test:unit -w @evidara/api` runs only the service-free unit
tests (`vitest.unit.config.ts`, no global setup) — that is what CI's `unit`
job uses.

Browser end-to-end: `npm run test:e2e` (production builds + Playwright; first
run needs `npx playwright install chromium`). The `e2e/` workspace's global
setup resets and reseeds `evidara_test`, starts a local fixture web server on
port 4123, and launches the built API (port 4000), web (`next start` on port
3010), and connector worker (`CAPTURE_FIXTURE_ALLOWLIST=localhost:4123`); a
single spec walks the plan §8 ten-step workflow: sign-in, case creation,
manual evidence, file upload, hash verification in the provenance drawer, a
fixture web capture observed to terminal success, captured provenance, an
audited download whose bytes are re-hashed, and the audit timeline.

Lint/format: Biome (`npm run lint`, `npm run format`; config in `biome.json`,
generated output excluded). CI: `.github/workflows/ci.yml` with five jobs —
quality (Biome, Prisma format/validate, typecheck), unit (no services),
integration (API + worker suites), e2e, and build-security (production builds
+ `npm audit --omit=dev --audit-level=moderate`). Service-backed jobs start
infrastructure with `docker compose up -d --wait` from the same pinned
compose file as local dev.

## Architecture decisions made during implementation

These are choices not fully spelled out in the plan; revisit deliberately,
not accidentally.

1. **Same-origin API proxy.** The browser calls `/v1/*` on the web origin;
   Next.js rewrites proxy to the API (`apps/web/next.config.ts`). The session
   cookie is HttpOnly and path-scoped to `/v1`, so Next server components
   never see it — identity and data load in client components through
   `apps/web/lib/api.ts`. Documented in `docs/architecture/ui-architecture.md`.
2. **Unauthorized case reads return 404, not 403**, to prevent case-ID
   enumeration. Update attempts by users who can read but not update return
   403; cross-tenant update attempts return 404.
3. **Org-admin oversight.** Organization OWNER/ADMIN get read-only oversight
   (`case.read`, `audit.read`) of cases they are not members of — except
   RESTRICTED cases, which require explicit case membership for everyone.
   Matrix lives in `apps/api/src/authorization/policy.ts`; pinned by unit
   tests.
4. **Case-create is open to all org roles** (OWNER/ADMIN/MEMBER); the creator
   becomes case OWNER. Case VIEWER permissions are `case.read` +
   `evidence.read` only — no downloads (downloads are audited, content-exposing
   actions reserved for ANALYST and up).
5. **Idempotent case creation** is stored on the `Case` row
   (`organizationId, idempotencyKey` unique); replays return 200 with the
   original case. The web form generates one UUID key per form mount.
6. **Optimistic concurrency** via integer `version` + `If-Match` header;
   conflict returns 412 with `currentVersion`. Archive/reactivate is
   `PATCH { status }`, not a separate endpoint.
7. **CSRF** is a rotating synchronizer token (digest stored on the session)
   plus Origin validation on all state-changing requests. `GET /v1/auth/csrf`
   rotates; the web client recovers once automatically from a rotated token.
8. **Passwords/tokens:** Argon2id (versioned parameters, OWASP minimums) with
   a dummy-hash verify on unknown emails to equalize login timing; session
   tokens are 256-bit, stored only as SHA-256 digests; IPs stored only as
   HMAC-SHA256 keyed by `SESSION_SECRET`.
9. **`evidence.update` policy action added** (OWNER and ANALYST only). The
   plan's representative action list has no update action, but the PATCH
   evidence endpoint exists in §5 and deny-by-default requires an explicit
   action. REVIEWER/VIEWER cannot annotate.
10. **Upload flow ordering:** multipart metadata fields must precede the file
    part; the API validates metadata (and authorization, and idempotency
    replay) before accepting any bytes. The web upload dialog appends fields
    to `FormData` before the file for this reason.
11. **Blob dedup and promotion.** Bytes stream through SHA-256 to
    `uploads/tmp/<uploadId>`; after verification the object is server-side
    copied to an opaque `evidence/<uuid>` key. `EvidenceBlob` is unique on
    `(sha256, byteSize)` — identical content re-uses the existing blob and the
    redundant copy is deleted. An `Upload` row tracks every attempt
    (`PENDING/COMPLETED/FAILED` + `errorCode`) so interrupted transfers leave
    a cleanup pointer, never evidence rows.
12. **Content typing:** `file-type` magic-byte detection; text formats (no
    magic bytes) accept the declared type only from a small text allowlist,
    else degrade to `text/plain`; undetectable binary becomes
    `application/octet-stream` (rejected by the default allowlist). Policy is
    `UPLOAD_MAX_BYTES` / `UPLOAD_ALLOWED_MEDIA_TYPES` /
    `UPLOAD_TIMEOUT_SECONDS` / `DOWNLOAD_URL_TTL_SECONDS` in config.
13. **Downloads return JSON `{ url, expiresAt, filename }`** with a 60-second
    presigned MinIO GET (forced `attachment` disposition), and write an
    `evidence.downloaded` audit event. Object keys and buckets never appear
    in any API response.
14. **The `web-page-capture` connector lives in `packages/connectors-sdk`**,
    not in the worker: the API needs its manifest (for `GET /v1/connectors`
    and input validation) and the worker needs its execution, and `apps/*`
    cannot import from `workers/*`. The SDK exports the manifest registry,
    the SSRF URL/address policy, and `captureWebPage`; the worker composes
    them in `workers/connectors/src/execute.ts`. Revisit the layout if the
    connector count grows.
15. **SSRF enforcement is layered.** The API rejects only what is statically
    checkable at submission (scheme, embedded credentials, blocked literal
    IPs — `INVALID_TARGET`). The worker is authoritative: it re-normalizes,
    resolves DNS, classifies every IPv4/IPv6 address (loopback, private,
    link-local, CGNAT, multicast, reserved, metadata, NAT64/6to4/Teredo,
    fail-closed on unparseable), pins connections to the validated addresses
    (DNS-rebinding defense), and repeats all of it on every redirect hop.
    `CAPTURE_FIXTURE_ALLOWLIST` (exact `host:port` entries) exempts local
    test fixture servers from address classification only — it is forced
    empty in production builds.
16. **No automatic retries.** BullMQ runs each queue entry once
    (`attempts: 1`); retry is the explicit
    `POST .../connector-jobs/:jobId/retry` endpoint, allowed only when the
    job is FAILED, the last `ConnectorAttempt` is classified retryable
    (TIMEOUT, DNS_FAILURE, CONNECTION_FAILED, 5xx/429, ENQUEUE_FAILED), and
    `attemptCount < 5`. `nextRetryAt` exists in the schema but is unused
    until automatic retries are wanted.
17. **Capture evidence records.** The worker ingests through the same
    temp-key → promote → transaction pattern as uploads (including an
    `Upload` cleanup row and blob dedup). Evidence idempotency key is
    `connector-job:<jobId>`, so a re-executed job can never duplicate
    evidence. Captures inherit the case handling level. Raw HTML is the
    evidence blob; extracted readable text is stored in
    `rawMetadata.extractedText` capped at 100 k chars (flagged when
    truncated). Provenance records requested/final/canonical URLs, redirect
    chain, HTTP status, user agent, fetch time, duration, hash, and
    connector version. Response headers are stored after dropping
    `set-cookie`.
18. **Central audit service.** All API audit writes go through
    `recordAuditEvent` in `apps/api/src/lib/audit.ts`: action names are
    validated against the registry in `@evidara/contracts` (`AUDIT_ACTIONS`),
    metadata is shape-validated, and every event stores `requestId` plus an
    HMAC-keyed `ipHash` (never exposed in responses). Service functions take
    an `AuditContext` (`auditContextFrom(request)`) instead of a bare request
    id. The worker writes audit rows directly (it cannot import API code)
    with actions typed `satisfies AuditAction`.
19. **Denials and authentication are audited.** Every case-scoped 403 writes
    `authorization.denied` with `metadata.attemptedAction` (actor = the
    denied user). Login success/failure (known users only — unknown emails
    have no organization anchor) and logout write `auth.login`/`auth.logout`
    per organization membership. Cross-tenant 404 probes are deliberately
    not audited (the prober is not a member of the target organization).
20. **Audit reads.** `GET /v1/cases/:caseId/audit-events` requires
    `audit.read` (case OWNER and REVIEWER, plus org OWNER/ADMIN oversight on
    non-RESTRICTED cases; ANALYST and VIEWER are denied). Append-only is
    pinned by tests (no mutation route exists); a database trigger or
    restricted role is still required before production — documented with
    the metadata allowlist and retention policy in
    `docs/architecture/system-architecture.md` §6 "Audit trail".
21. **Biome is the formatter and linter** (`biome.json`, recommended rules,
    style matched to the existing codebase). It replaced nothing — no
    tooling existed before Phase 7. Generated output (`dist`, `.next`,
    `next-env.d.ts`, the lockfile) is excluded; everything else, including
    JSON and CSS, is in scope. `prisma format` keeps the schema canonical
    and CI diffs against it.
22. **The Next.js postcss advisory is closed with an npm override**
    (`"overrides": { "postcss": "^8.5.10" }` in the root package.json) plus
    a regenerated lockfile. Even the latest stable Next 16 still pins the
    vulnerable `postcss@8.4.31`; the override is semver-compatible and can
    be dropped once Next ships a fixed dependency. `npm audit` is clean.
23. **The e2e stack runs the API on port 4000 because `next build` bakes
    the `/v1` rewrite destination** (`next.config.ts` reads `API_URL` at
    build time; a runtime `API_URL` cannot move it for `next start`). The
    e2e web server uses a dedicated port 3010, fixture server 4123;
    everything is orchestrated by `e2e/global-setup.ts` (reset + seed test
    DB, readiness polling, process-group teardown). Stop a dev API before
    running e2e locally.
24. **CI starts infrastructure with the repo's docker-compose.yml**
    (`docker compose up -d --wait`) instead of GitHub service containers:
    one pinned source of truth for images and health checks, and GitHub
    service containers cannot pass MinIO its required `server` command.
    Two deliberate plan deviations, both small: unit-test coverage
    reporting is not wired up (no thresholds were defined; a report
    without a gate is decorative), and no secret-scanning step is included
    yet (gitleaks licensing varies by repo ownership) — revisit both at
    the Phase 8 release gate.

## Environment and tooling gotchas

- **Container runtime is colima** on this Mac (`colima start`; docker CLI via
  Homebrew). Starting colima auto-restarts containers from other projects: a
  `twenty-dev` stack grabs ports 5432/6379. If `dev:infra` fails on port
  binding, `docker stop twenty-dev-db-1 twenty-dev-redis-1` first. If compose
  containers come up with no port bindings after such a clash,
  `docker compose up -d --force-recreate --wait <service>`.
- **Prisma's AI-agent guard** blocks `prisma migrate reset` (and so
  `npm run db:reset`) when run by Claude Code or similar; it requires explicit
  human consent via `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Humans run
  it normally.
- **`prisma migrate dev` needs a TTY** when a migration triggers a warning
  prompt. Non-interactive fallback used for the idempotency migration:
  `prisma migrate diff --from-url ... --to-schema-datamodel ... --script` into
  a hand-made migration folder, then `prisma migrate deploy`.
- **Web typecheck requires generated route types**: the web `typecheck` script
  runs `next typegen && tsc --noEmit` (Next typed routes are enabled).
- **In browser e2e, never assert on bare `[role=alert]`** — Next.js injects a
  `<next-route-announcer>` with that role on every page. Use specific
  selectors (`p.formError`).
- **`next build` bakes rewrites into the build manifest.** Setting `API_URL`
  when launching `next start` does nothing; the `/v1` proxy destination is
  fixed at build time (this cost a full e2e debugging round — see decision
  23).
- **Worker/e2e tests import config-reading modules dynamically.** The worker
  config parses `CAPTURE_FIXTURE_ALLOWLIST` at module load, so tests start
  their fixture servers first, set the env var, then `await import(...)` the
  execution service.
- **npm overrides do not reconcile an already-settled lockfile.** Adding an
  override left the vulnerable hoisted package in place (and deleting just
  its lock entry produced a tree with the dependency missing entirely). When
  an override will not take, regenerate `package-lock.json` from scratch and
  re-verify with the full test suite.
- Node ≥ 22 required; env files load in-process via `process.loadEnvFile`
  (real environment variables always win; `NODE_ENV=test` switches to
  `.env.test`, which is committed and must never hold real secrets).
- **BullMQ custom job ids cannot contain `:`** — the producer uses
  `<jobId>-attempt-<n>`. Retries need a distinct queue job id or BullMQ
  silently deduplicates them.
- **undici v7 removed `maxRedirections`** from `request()` options; it never
  follows redirects, which is exactly what the capture loop relies on.
- `npm audit` is clean (the Next.js postcss advisories were resolved in
  Phase 7 via the override in decision 22); CI's build-security job fails on
  any new moderate-or-higher production advisory.

## Local dev database state (cosmetic)

Verification left behind: a case named "My conflicting rename" (id in audit
history), users `viewer@evidara.local` (password = seed owner's), two
"Manual check case" rows, a "Phase 4 verification case" holding one uploaded
text file, one manual evidence item, and a FAILED upload row from the
rejected-type check, and a "Phase 5 verification case" holding one
`example.com` web capture plus two FAILED connector jobs (a BLOCKED_TARGET
and a twice-attempted DNS_FAILURE). Deleting cases via SQL is blocked by the
append-only `AuditEvent` restrict FK — by design. A consented
`npm run db:reset` clears everything (MinIO objects under `evidence/`
survive a database reset; wipe the bucket too if you want a truly clean
slate).

## Next work

Both milestones are closed. In order:

1. **Publish and confirm CI.** No git remote is configured; CI has never
   executed on GitHub. On first push, confirm all five jobs pass from a
   clean clone (the one release-gate acceptance criterion that cannot be
   verified locally — every job's commands were run locally and pass).
2. **Plan the next feature milestone.** The design milestone's
   recommendation (docs/design/README.md): graph + minimal entity
   extraction first — it forces the entities/relations schema, ontology
   enforcement, and citation join into existence, and timeline/map then
   arrive as projections over the same model. Write the delivery plan the
   way the previous two were written; the data-requirements sections of
   graph.md/timeline.md/map.md/notebook.md are the schema/API inputs.
3. **Carry-forward engineering debts** (recorded in README known
   limitations): audit append-only database enforcement, audit retention
   policy, connector rate-limit enforcement, outbox wiring, membership
   management, CI coverage reporting and secret scanning. Design debts
   from tokens.md/components.md: spacing normalization and the
   button/dl consolidation, queued for the first deliberate
   visual-change pass.

## Conventions observed so far

- One commit per phase, repository building and tests passing at each.
- Route handlers stay thin; domain logic in `modules/*/service.ts`;
  authorization decisions only through the policy service.
- Shared request/response schemas in `packages/contracts` (Zod); the API
  validates with them, the web imports the types.
- Audit events are written in the same transaction as the mutation they
  record; metadata is allowlisted, never secrets or evidence content.
- New endpoints get integration tests in `apps/api/tests/integration/`
  covering the deny paths (cross-tenant, insufficient role, stale version),
  not just success.
