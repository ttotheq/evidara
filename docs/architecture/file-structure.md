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
│   ├── connectors-sdk/      # Connector manifest and execution interfaces
│   ├── contracts/           # Zod schemas and shared API types
│   ├── database/            # Prisma schema, migrations, database client
│   ├── ontology/            # Entity/relation registry and validation
│   └── reporting/           # Report AST and export interfaces
├── docs/
│   ├── architecture/        # Technical design and decisions
│   ├── requirements/        # Product requirements
│   └── api/                 # Endpoint and event contracts
├── docker-compose.yml       # Local PostgreSQL, Redis, and MinIO
├── package.json             # npm workspace orchestration
└── tsconfig.base.json       # Shared strict TypeScript settings
```

Inside each application, dependencies point inward:

```text
transport -> application -> domain
                  |
             infrastructure
```

Route handlers validate input and call application services. Domain code owns
invariants. Infrastructure adapters implement persistence, queues, storage, AI,
search, and external-source access.

