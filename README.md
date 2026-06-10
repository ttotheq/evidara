# Evidara

Evidara is an open-source, evidence-centered OSINT investigation workspace.
It preserves provenance from collection through analysis and reporting.

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

1. Copy `.env.example` to `.env` and replace the placeholder session secret
   and seed owner password with local-only values.
2. Run `npm install`.
3. Run `npm run dev:infra` to start PostgreSQL, Redis, and MinIO and wait for
   their health checks.
4. Run `npm run dev:bootstrap` to apply database migrations, create the
   evidence bucket, and seed the local organization and owner account.
5. Run `npm run dev` to start the web app, API, and workers.

The web app runs at `http://localhost:3000` and the API at
`http://localhost:4000`. `GET /health/ready` on the API reports the status of
PostgreSQL, Redis, and object storage.

Useful commands:

- `npm run dev:workers` starts only the connector and AI workers.
- `npm run db:migrate` creates and applies a new migration in development.
- `npm run db:reset` drops the database, reapplies all migrations, and reseeds.
- `npm run db:seed` reapplies the development seed (safe to repeat).

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
