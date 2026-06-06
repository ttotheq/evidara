# API Surface

Base path: `/v1`. REST is the command and integration API. GraphQL is a
read-optimized analyst UI API at `/graphql`. `/openapi.json` is generated from
the same schemas used for runtime validation.

## Identity and organizations

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Create a browser session |
| POST | `/auth/logout` | Revoke the current session |
| GET | `/me` | Current user and effective memberships |
| GET | `/organizations/:orgId/members` | List members |
| POST | `/organizations/:orgId/invitations` | Invite a member |
| PATCH | `/organizations/:orgId/members/:userId` | Change organization role |

## Cases and collaboration

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/cases` | List or create cases |
| GET/PATCH | `/cases/:caseId` | Read or update case metadata |
| POST | `/cases/:caseId/duplicate` | Duplicate case structure, not evidence |
| POST | `/cases/:caseId/archive` | Archive a case |
| GET/POST | `/cases/:caseId/members` | List or add collaborators |
| PATCH/DELETE | `/cases/:caseId/members/:userId` | Update or remove collaborator |
| GET/POST | `/cases/:caseId/tasks` | List or create tasks |
| GET | `/cases/:caseId/audit-events` | Paginated append-only audit history |

## Collection and evidence

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/connectors` | Available connectors and safety manifests |
| POST | `/cases/:caseId/connector-jobs` | Queue an approved collection |
| GET/POST | `/cases/:caseId/connector-jobs/:jobId` | Inspect or retry a job |
| POST | `/cases/:caseId/evidence/uploads` | Initiate multipart upload |
| POST | `/cases/:caseId/evidence/uploads/:uploadId/complete` | Verify and finalize upload |
| GET | `/cases/:caseId/evidence` | Filtered evidence register |
| GET/PATCH | `/cases/:caseId/evidence/:evidenceId` | Read or annotate metadata |
| POST | `/cases/:caseId/evidence/:evidenceId/verify` | Record review decision |
| GET | `/cases/:caseId/evidence/:evidenceId/download` | Audited signed download |

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

