# Repository Structure

```text
evidara/
├── apps/
│   ├── api/                 # HTTP transport and domain application services
│   └── web/                 # Analyst-facing Next.js application
├── workers/
│   ├── connectors/          # Collection and normalization jobs
│   └── ai/                  # Evidence-bound model jobs
├── packages/
│   ├── connectors-sdk/      # Connector manifests, SSRF policy, capture execution
│   ├── contracts/           # Zod schemas and shared API types
│   ├── database/            # Prisma schema, migrations, database client
│   ├── ontology/            # Entity/relation registry and validation
│   └── reporting/           # Report AST and export interfaces
├── e2e/                     # Playwright browser test and self-contained stack
├── docs/
│   ├── architecture/        # Technical design and decisions
│   ├── requirements/        # Product requirements
│   ├── api/                 # Endpoint and event contracts
│   ├── security/            # Security assumptions and responsible use
│   └── plans/               # Milestone delivery plans
├── .github/workflows/       # CI pipeline (quality, unit, integration, e2e)
├── docker-compose.yml       # Local PostgreSQL, Redis, and MinIO
├── biome.json               # Formatter and linter configuration
├── package.json             # npm workspace orchestration
└── tsconfig.base.json       # Shared strict TypeScript settings
```

Unit tests live next to each package in `tests/` (`apps/api/tests`,
`packages/connectors-sdk/tests`, `workers/connectors/tests`); integration
suites create their own `_test`-suffixed database and test bucket.

Inside each application, dependencies point inward:

```text
transport -> application -> domain
                  |
             infrastructure
```

Route handlers validate input and call application services. Domain code owns
invariants. Infrastructure adapters implement persistence, queues, storage, AI,
search, and external-source access.

