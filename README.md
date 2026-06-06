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

## Local setup

1. Copy `.env.example` to `.env`.
2. Run `docker compose up -d`.
3. Run `npm install`.
4. Run `npm run db:generate`.
5. Run `npm run db:migrate`.
6. Run `npm run dev`.

The web app runs at `http://localhost:3000` and the API at
`http://localhost:4000`.

## Product guardrails

- No covert collection, credential theft, or doxxing workflows.
- AI output remains a reviewable suggestion until an analyst accepts it.
- Claims and relations require evidence citations or an explicit inference
  label.
- Audit records are append-only.

