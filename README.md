# Evidara

Evidara is an open-source, evidence-centered OSINT investigation workspace.
It preserves provenance from collection through analysis and reporting.

Licensed under [AGPL-3.0](LICENSE): if you run a modified Evidara as a
hosted service, you must make your modifications available under the same
license.

## Architecture

The MVP is a TypeScript monorepo deployed as a modular monolith plus isolated
workers:

- `apps/web`: Next.js analyst workspace
- `apps/api`: REST, GraphQL, authentication, authorization, and domain services
- `workers/connectors`: sandboxed collection jobs
- `workers/ai`: evidence-bound AI suggestions
- `packages/database`: PostgreSQL schema and client
- `packages/contracts`: shared validation and API contracts
- `packages/ontology`: entity and relationship definitions
- `packages/connectors-sdk`: connector authoring contract
- `packages/reporting`: report document model and exporters

See [System Architecture](docs/architecture/system-architecture.md) for the
complete design.

## Delivery plan

The next milestone is specified in
[First Usable Vertical Slice](docs/plans/first-usable-vertical-slice.md). It
covers authentication, organizations, cases, evidence ingestion, secure web
capture, auditability, automated tests, and CI.

## Local setup

Prerequisites: Node.js 22 or newer, npm 10 or newer, and a Docker-compatible
container runtime with the `docker compose` plugin (Docker Desktop, colima,
or similar) running before step 3.

1. Copy `.env.example` to `.env` and replace the placeholder session secret
   (at least 32 random characters) and seed owner password (at least 12
   characters) with local-only values.
2. Run `npm install`.
3. Run `npm run dev:infra` to start PostgreSQL, Redis, and MinIO and wait for
   their health checks.
4. Run `npm run dev:bootstrap` to apply database migrations, create the
   evidence bucket, and seed the local organization and owner account.
5. Run `npm run dev` to start the web app, API, and workers.

The web app runs at `http://localhost:3000` and the API at
`http://localhost:4000`. Sign in at `http://localhost:3000/login` with the
`SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` values from your `.env`. From
there the complete slice workflow is available: create a case, add manual
evidence or upload a file, queue a web page capture from the case's Jobs
tab, download evidence from the source register, and review the case's audit
timeline. `GET /health/ready` on the API reports the status of PostgreSQL,
Redis, and object storage.

Useful commands:

- `npm run dev:workers` starts only the connector and AI workers.
- `npm run db:migrate` creates and applies a new migration in development.
- `npm run db:reset` drops the database, reapplies all migrations, and reseeds.
- `npm run db:seed` reapplies the development seed (safe to repeat).

### Troubleshooting

- **`dev:infra` fails to bind a port** — another stack is already using
  5432, 6379, 9000, or 9001. Stop the conflicting containers or services. If
  compose containers then come up without port bindings, recreate them:
  `docker compose up -d --force-recreate --wait <service>`.
- **Containers exist but services are unreachable** — confirm the container
  runtime is actually running (`docker ps`); on colima, `colima start`
  first. Note that starting a runtime may auto-restart containers from other
  projects that grab the same ports.
- **`db:reset` refuses to run under an AI coding agent** — Prisma requires
  explicit human consent for destructive commands. Run it from a normal
  terminal, or set `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` as Prisma
  prompts.
- **Sign-in fails after changing seed values in `.env`** — run
  `npm run db:seed` again; the seed upserts the owner account and refreshes
  its password hash, and is safe to repeat.
- **`npm run test:e2e` fails to start** — build artifacts are required
  (the root script builds first; run `npm run build` if invoking Playwright
  directly), the Playwright browser must be installed once
  (`npx playwright install chromium`), and the suite starts its own API on
  port 4000 — stop a running dev API first.
- **Tests fail with "validation silently absent" symptoms** — workspace
  packages are stale; the `pretest` hooks rebuild them, so do not bypass the
  npm scripts.

## Tests and quality checks

- `npm test` runs every vitest suite. Unit tests are self-contained; the API
  and worker integration suites need the local infrastructure from
  `npm run dev:infra` and create their own `evidara_test` database and
  `evidara-evidence-test` bucket.
- `npm run test:e2e` builds production bundles, then drives a browser through
  sign-in, case creation, evidence upload, web capture, download, and the
  audit timeline against a local fixture web server (first run:
  `npx playwright install chromium`). It starts its own API on port 4000 and
  web server on port 3010, so stop a running dev API first.
- `npm run lint` and `npm run format` run Biome checks and formatting.
- `npm run typecheck` type-checks every workspace.
- GitHub Actions (`.github/workflows/ci.yml`) runs quality, unit,
  integration, end-to-end, and build/dependency-audit jobs on every push and
  pull request. No test depends on the public internet.

## Environment files

- `.env` holds local development values and is not committed.
- `.env.test` holds test-only values and is committed; it must never contain
  real secrets.
- Variables already set in the process environment take precedence over both
  files. Processes validate their configuration at startup and exit with a
  readable error when required values are missing.

## Product guardrails

- No covert collection, credential theft, or doxxing workflows.
- AI output remains a reviewable suggestion until an analyst accepts it.
- Claims and relations require evidence citations or an explicit inference
  label.
- Audit records are append-only.

Web capture has a dedicated security and responsible-use document:
[Web Capture: Security Assumptions and Responsible Use](docs/security/web-capture.md).

## Status and known limitations

The [first usable vertical slice](docs/plans/first-usable-vertical-slice.md)
is complete: authentication and sessions, organizations and role-based
authorization, cases, evidence ingestion with streaming SHA-256 hashing and
signed downloads, the secure web-page capture connector, append-only audit
interfaces, and the automated test and CI pipeline. Known limitations going
into the next milestone:

- **Audit append-only is enforced at the application layer only.** No API
  route can modify audit events (pinned by tests), but the database role can.
  Add a trigger or a restricted database role before any production
  deployment (`docs/architecture/system-architecture.md` §6).
- **No audit retention or archival policy.** Events live for the life of
  their case; production deployments must define retention windows that meet
  their legal obligations.
- **Connector rate limits are declared, not enforced.** The manifest's
  rate limit is published metadata; the worker does not yet throttle.
- **No automatic job retries.** Retries are explicit, analyst-initiated, and
  audited; `nextRetryAt` exists in the schema for a future automatic policy.
- **The `OutboxEvent` table is unused.** Reliable event publication via an
  outbox is designed but not yet wired up; the current after-commit enqueue
  marks failures retryable instead.
- **No membership management.** Organization members and case collaborators
  are created by the seed or directly in the database; invitation and member
  management endpoints are a later milestone.
- **CI gaps.** Unit-test coverage reporting and secret scanning are not yet
  wired into the pipeline.

Next milestone: a dedicated design milestone — formalize the CSS visual
language into a documented token and component system, and do interaction
design for the post-slice surfaces (entity graph, timeline, map, notebook) —
before further feature code.
