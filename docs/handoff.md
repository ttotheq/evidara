# Evidara Handoff

Date: 2026-06-10
Branch: `master` (note: tooling expects `main` as the eventual PR target; not yet reconciled)
Last commit at handoff: `fc2727e`

## What this project is

Evidara is an open-source, evidence-centered OSINT investigation workspace
(TypeScript monorepo: Next.js web, Fastify API, BullMQ workers, PostgreSQL,
Redis, MinIO). The active milestone is the
[first usable vertical slice](plans/first-usable-vertical-slice.md) — an
eight-phase plan covering auth, cases, evidence ingestion, secure web capture,
audit, tests, and CI. **Where any other document disagrees with that plan, the
plan wins.**

## Milestone status: 3 of 8 phases complete

| Phase | Scope | Status | Commit |
| --- | --- | --- | --- |
| 1 | Dev environment, initial migration, seed, readiness checks | Done | `733e64a` |
| 2 | Sessions, authentication, CSRF, central authorization | Done | `55a8b00` |
| 3 | Case workspace (case API + first real web UI) | Done | `b5d6b4f` |
| 4 | Evidence ingestion and source register | **Next** | — |
| 5 | Secure web-page capture connector | Pending | — |
| 6 | Audit interfaces | Pending | — |
| 7 | Automated testing and CI | Pending | — |
| 8 | Documentation and release gate | Pending | — |

Each phase landed as one commit on a building, tested tree. Phase 4 starts at
plan §7 "Phase 4" with the API contract in §5 and the upload architecture in
§3 "Evidence upload" (API-streamed multipart, SHA-256 while streaming,
temporary-then-promoted MinIO keys; presigned upload explicitly deferred).

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

Tests: `npm test -w @evidara/api` — 87 vitest tests (unit + integration).
Integration tests auto-create an `evidara_test` database and apply migrations;
the global setup refuses any database whose name does not end in `_test`.
A `pretest` hook rebuilds workspace packages first — do not remove it; the API
resolves `@evidara/contracts` and `@evidara/database` from their compiled
`dist/`, and stale builds fail in confusing ways (validation silently absent).

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
- **For future browser e2e (Phase 7):** never assert on bare `[role=alert]` —
  Next.js injects a `<next-route-announcer>` with that role on every page.
  Use specific selectors (`p.formError`).
- Node ≥ 22 required; env files load in-process via `process.loadEnvFile`
  (real environment variables always win; `NODE_ENV=test` switches to
  `.env.test`, which is committed and must never hold real secrets).

## Local dev database state (cosmetic)

Verification left behind: a case named "My conflicting rename" (id in audit
history), users `viewer@evidara.local` (password = seed owner's), and two
"Manual check case" rows. Deleting cases via SQL is blocked by the append-only
`AuditEvent` restrict FK — by design. A consented `npm run db:reset` clears
everything.

## Phase 4 pointers (next work)

Read plan §3 "Evidence upload", §4 (Upload model + EvidenceBlob/EvidenceItem
amendments), §5 evidence endpoints, §7 Phase 4 deliverables/acceptance. Key
constraints: stream bytes through SHA-256 to a temporary MinIO key, never
trust client hash/MIME/filename, promote to an opaque immutable key in the
same transaction as the database records, short-lived signed downloads that
create audit events, interrupted uploads leave no durable record. The
`scripts/create-bucket.mjs` bootstrap and the readiness check's S3 client
(`apps/api/src/modules/health/routes.ts`) show the existing MinIO wiring
(`forcePathStyle: true` matters). UI: source register table, upload + manual
evidence dialogs, provenance drawer — visual language in
`apps/web/app/styles.css`, permission gating via `useCase().can(...)`.

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
