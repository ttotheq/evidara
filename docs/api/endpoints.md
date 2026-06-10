# API Surface

Base path: `/v1`. REST is the command and integration API. GraphQL is a
read-optimized analyst UI API at `/graphql`. The OpenAPI document is generated
from the same Zod schemas used for runtime validation and served at
`/docs/json` (interactive UI at `/docs`).

This document describes the full target surface. The subset implemented by the
[first usable vertical slice](../plans/first-usable-vertical-slice.md) so far:
authentication (`/auth/login`, `/auth/logout`, `/auth/csrf`, `/me`), cases
(`GET/POST /cases`, `GET/PATCH /cases/:caseId`), and evidence
(`POST /cases/:caseId/evidence/files`, `POST /cases/:caseId/evidence/manual`,
`GET /cases/:caseId/evidence`, `GET/PATCH /cases/:caseId/evidence/:evidenceId`,
`GET /cases/:caseId/evidence/:evidenceId/download`). Where this document and
the delivery plan disagree, the delivery plan wins.

## Identity and organizations

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Create a browser session |
| POST | `/auth/logout` | Revoke the current session |
| GET | `/auth/csrf` | Rotate and return the session CSRF token |
| GET | `/me` | Current user and effective memberships |
| GET | `/organizations/:orgId/members` | List members |
| POST | `/organizations/:orgId/invitations` | Invite a member |
| PATCH | `/organizations/:orgId/members/:userId` | Change organization role |

## Cases and collaboration

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/cases` | List or create cases |
| GET/PATCH | `/cases/:caseId` | Read or update case metadata; archive and reactivate via `status` |
| POST | `/cases/:caseId/duplicate` | Duplicate case structure, not evidence |
| GET/POST | `/cases/:caseId/members` | List or add collaborators |
| PATCH/DELETE | `/cases/:caseId/members/:userId` | Update or remove collaborator |
| GET/POST | `/cases/:caseId/tasks` | List or create tasks |
| GET | `/cases/:caseId/audit-events` | Paginated append-only audit history |

Unauthorized case reads return `404`, not `403`, so case identifiers cannot be
enumerated.

## Collection and evidence

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/connectors` | Available connectors and safety manifests |
| POST | `/cases/:caseId/connector-jobs` | Queue an approved collection |
| GET | `/cases/:caseId/connector-jobs` | List jobs and their states |
| GET | `/cases/:caseId/connector-jobs/:jobId` | Inspect a job |
| POST | `/cases/:caseId/connector-jobs/:jobId/retry` | Retry a retryable failure |
| POST | `/cases/:caseId/evidence/files` | Streaming multipart upload; SHA-256 computed server-side while streaming |
| POST | `/cases/:caseId/evidence/manual` | Record manual evidence without a binary object |
| GET | `/cases/:caseId/evidence` | Filtered evidence register |
| GET/PATCH | `/cases/:caseId/evidence/:evidenceId` | Read or annotate metadata |
| POST | `/cases/:caseId/evidence/:evidenceId/verify` | Record review decision |
| GET | `/cases/:caseId/evidence/:evidenceId/download` | Audited short-lived signed download |

Uploads stream through the API; presigned direct-to-storage upload is a later
addition for very large evidence, not the baseline.

## Ontology and analysis

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/cases/:caseId/entities` | Search or create entities |
| GET/PATCH | `/cases/:caseId/entities/:entityId` | Read or update an entity |
| POST | `/cases/:caseId/entities/merge` | Reversible duplicate merge |
| GET/POST | `/cases/:caseId/relations` | Query or create cited relations |
| GET/POST | `/cases/:caseId/notes` | Notebook documents |
| GET/POST | `/cases/:caseId/findings` | Findings with evidence citations |
| GET | `/cases/:caseId/search` | Full-text and faceted search |
| GET/POST | `/cases/:caseId/saved-searches` | Persist query definitions |

## AI and reports

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/cases/:caseId/ai-runs` | Queue an approved AI workflow |
| GET | `/cases/:caseId/ai-runs/:runId` | Inspect provenance and status |
| POST | `/cases/:caseId/ai-suggestions/:id/accept` | Accept/edit a suggestion |
| POST | `/cases/:caseId/ai-suggestions/:id/reject` | Reject with optional reason |
| GET/POST | `/cases/:caseId/reports` | List or create reports |
| GET/PATCH | `/cases/:caseId/reports/:reportId` | Read or edit report structure |
| POST | `/cases/:caseId/reports/:reportId/exports` | Queue Markdown/PDF export |
| GET | `/cases/:caseId/exports/:exportId` | Inspect or download export |

## Integration endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/cases/:caseId/imports/stix` | Validate and import a STIX bundle |
| POST | `/cases/:caseId/exports/stix` | Create a STIX bundle |
| POST | `/cases/:caseId/exports/csv` | Create selected table exports |
| POST | `/cases/:caseId/exports/json` | Create a reproducible case package |

List endpoints use cursor pagination. Mutations require `Idempotency-Key`.
Concurrency-sensitive updates require `If-Match` with the record version.

