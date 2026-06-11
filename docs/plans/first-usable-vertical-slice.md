# First Usable Vertical Slice Delivery Plan

Status: implemented (all eight phases complete; one commit per phase)  
Milestone: authenticated case-to-evidence workflow  
Source requirements: `docs/requirements/evidara-osint-platform-prd.md`  
Architecture baseline: `docs/architecture/system-architecture.md`

## 1. Milestone Outcome

Deliver the first genuinely usable Evidara workflow:

1. A user starts the local stack and applies database migrations.
2. The user signs in and operates within an organization.
3. The user creates a case and opens its workspace.
4. The user adds manual evidence or uploads a supported file.
5. Evidara hashes the file while streaming it to MinIO, records immutable
   provenance, and displays it in the source register.
6. The user queues a secure web-page capture.
7. The connector worker captures the approved public page, stores the original
   response and derived artifacts, and records job status.
8. Authorized users can inspect audit events and connector jobs.
9. Automated tests and CI verify the complete path.

This milestone does not include the entity graph, AI extraction, notebook,
timeline, map, reports, invitations by email, SSO, or production cloud
deployment.

## 2. Definition of Done

The milestone is complete when all of the following are true:

- `docker compose up -d` starts healthy PostgreSQL, Redis, and MinIO services.
- A documented bootstrap command applies migrations, creates the evidence
  bucket, and seeds a local organization plus owner account.
- Authentication uses secure server-managed sessions. The temporary
  `x-user-id` and `x-organization-id` trust model is removed.
- Authorization is deny-by-default and has automated role matrix coverage.
- An owner or analyst can create and view a case from the web interface.
- A viewer cannot create cases, add evidence, or run connectors.
- Supported files can be uploaded without loading the entire file into API
  memory.
- SHA-256, byte count, MIME type, original filename, collection time, actor,
  case, and storage key are recorded.
- Manual evidence can be created without a binary object.
- The evidence register supports pagination and filters for kind, status, and
  collection date.
- Evidence downloads use short-lived signed URLs and create access audit events.
- Web capture blocks unsafe targets and redirects, applies limits, preserves
  raw response artifacts, and records normalized metadata.
- Connector jobs expose queued, running, succeeded, failed, and retryable
  states with human-readable messages.
- Audit records are append-only through application permissions and normal API
  paths.
- Integration tests cover sign-in through evidence registration.
- CI runs formatting/lint checks, type checks, unit tests, integration tests,
  production builds, Prisma validation, and dependency auditing.
- The repository is clean and documentation matches the implemented commands.

## 3. Architectural Decisions

### Authentication

Use opaque, database-backed sessions in an HTTP-only cookie rather than JWTs.
This keeps revocation, disabled-user handling, and sensitive-case access
straightforward.

- Passwords: Argon2id with versioned parameters.
- Session token: at least 256 bits of randomness; store only a SHA-256 digest.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production, narrow path.
- CSRF: origin validation plus a synchronizer token for state-changing requests.
- Session rotation: rotate after sign-in and security-sensitive changes.
- Development bootstrap: seed a known local owner from environment variables;
  never ship a production default password.

Add `Session` and, if invitation support is retained in scope, `Invitation`
models. Public registration remains disabled.

### Tenancy and authorization

Create a central authorization service with explicit actions instead of
scattering role comparisons across routes.

Representative actions:

- `organization.members.read`
- `organization.members.manage`
- `case.create`
- `case.read`
- `case.update`
- `case.members.manage`
- `evidence.create`
- `evidence.read`
- `evidence.download`
- `connector.run`
- `connector.retry`
- `audit.read`

Effective access combines:

1. Active user status.
2. Organization membership and role.
3. Case membership and role.
4. Case handling level.
5. Requested action.

All repositories require organization and case scope. Route handlers must not
accept identity or tenancy from arbitrary request headers.

### Evidence upload

Use an API-streamed multipart upload for this milestone:

1. Validate metadata and permissions before accepting bytes.
2. Stream bytes through a SHA-256 transform directly to a temporary MinIO key.
3. Enforce maximum size, allowed MIME types, and timeout during streaming.
4. Verify observed byte count and detected content type.
5. Promote or server-side copy the object to an opaque immutable key.
6. Create `EvidenceBlob`, `EvidenceItem`, and audit/outbox records in a database
   transaction.
7. Remove temporary objects on failure or by lifecycle cleanup.

Do not trust browser-provided MIME type, filename, digest, or object key.
Presigned direct upload can be added later for very large evidence.

### Web-page capture

Implement a single `web-page-capture` connector through the existing connector
SDK and worker.

The worker must:

- Accept only `http` and `https`.
- Normalize and validate the URL.
- Resolve DNS and reject loopback, private, link-local, multicast, reserved,
  and cloud metadata addresses for IPv4 and IPv6.
- Repeat validation after every redirect and DNS resolution.
- Limit redirects, response bytes, duration, decompressed size, and content
  type.
- Use an identifiable user agent and preserve response status and headers after
  removing secrets such as cookies.
- Capture raw response bytes and extracted readable text.
- Record canonical URL, requested URL, final URL, timestamps, connector version,
  hash, and incomplete/truncated state.
- Avoid executing arbitrary page JavaScript in the first implementation.

Screenshot capture is a follow-up inside this milestone only if it can run in a
sandboxed browser with strict network interception using the same SSRF policy.
Raw HTML and text capture are required; screenshot capture is not allowed to
weaken the security gate.

### Auditability

Use an application audit service called inside the same transaction as each
successful mutation. Denied and failed security-relevant actions are also
logged without storing secrets or evidence content.

Audit metadata includes:

- actor and organization
- case when applicable
- action and resource
- outcome
- request ID
- privacy-preserving IP hash
- safe structured metadata
- timestamp

The audit table has no update or delete API. Add a database trigger or restricted
database role before production deployment; this milestone must at least test
that application code exposes no mutation path.

## 4. Required Data Model Changes

Extend the Prisma schema and commit a real initial migration.

### New models

- `Session`
  - `id`, `userId`, `tokenDigest`, `csrfDigest`
  - `expiresAt`, `lastSeenAt`, `revokedAt`
  - `createdAt`, `ipHash`, `userAgent`
- `Upload`
  - tracks temporary object key, expected/observed size, status, expiry, actor,
    case, and idempotency key
- `ConnectorAttempt`
  - attempt number, started/completed timestamps, retryability, safe error code
    and message

### Amend existing models

- `EvidenceBlob`
  - add storage provider, bucket, ETag/version ID, detected MIME type, and
    retention state
- `EvidenceItem`
  - add original filename, description, collection completeness, and explicit
    provenance/lineage JSON
- `ConnectorJob`
  - add requested URL/target summary, cancellation timestamp, next retry time,
    result evidence ID, and relation to attempts
- `AuditEvent`
  - use an action enum or validated registry; add user-agent hash if useful
- `OutboxEvent`
  - add attempt count, next attempt time, and last error

### Migration rules

- Migrations are immutable after merge.
- CI must create an empty database from migrations, not `db push`.
- Seed data must be repeatable and clearly development-only.
- Add indexes for session lookup, evidence register filters, connector job
  queues, and case audit pagination.

## 5. API Contract

Use shared Zod contracts for request and response schemas. Generate OpenAPI from
the route schemas.

### Authentication and context

- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `GET /v1/me`
- `GET /v1/auth/csrf`

Every authenticated response should expose only safe user and effective
membership data. Authentication failures use a generic message.

### Organizations and cases

- `GET /v1/organizations`
- `GET /v1/organizations/:organizationId/members`
- `GET /v1/cases`
- `POST /v1/cases`
- `GET /v1/cases/:caseId`
- `PATCH /v1/cases/:caseId`

Case commands require idempotency keys. Updates require `If-Match` using the
record version.

### Evidence

- `POST /v1/cases/:caseId/evidence/files`
  - streaming multipart body with metadata
- `POST /v1/cases/:caseId/evidence/manual`
- `GET /v1/cases/:caseId/evidence`
- `GET /v1/cases/:caseId/evidence/:evidenceId`
- `PATCH /v1/cases/:caseId/evidence/:evidenceId`
- `GET /v1/cases/:caseId/evidence/:evidenceId/download`

List responses use stable cursor pagination and never expose object keys.

### Connectors and jobs

- `GET /v1/connectors`
- `POST /v1/cases/:caseId/connector-jobs`
- `GET /v1/cases/:caseId/connector-jobs`
- `GET /v1/cases/:caseId/connector-jobs/:jobId`
- `POST /v1/cases/:caseId/connector-jobs/:jobId/retry`

Retry creates a new attempt under the same logical job only when the failure is
classified as retryable and authorization still permits collection.

### Audit

- `GET /v1/cases/:caseId/audit-events`

Return safe display metadata only. Raw connector payloads, session data,
password material, cookies, and object-storage credentials never appear.

## 6. Web Application Plan

Replace the current marketing-only page with an authenticated application
while retaining its visual language.

### Routes

- `/login`
- `/cases`
- `/cases/new`
- `/cases/[caseId]/overview`
- `/cases/[caseId]/sources`
- `/cases/[caseId]/jobs`
- `/cases/[caseId]/audit`
- `/cases/[caseId]/settings`

### Shared application shell

- Organization switcher or fixed active organization for the first local build.
- Case navigation.
- Handling-level banner.
- Current user menu and sign-out.
- Permission-aware buttons and navigation.
- Global job activity indicator.

### Case list and creation

- Search and status filtering.
- Empty, loading, error, and unauthorized states.
- Creation form for name, objective, scope, justification, handling level, and
  prohibited collection boundaries.
- Redirect into the new case workspace after creation.

### Source register

- Table with title, kind, source, status, collected time, collector, file size,
  hash preview, and handling level.
- Filters for kind, status, date, and text.
- Details drawer or page showing full provenance and SHA-256.
- File upload and manual evidence dialogs.
- Audited download action.

### Connector jobs and audit

- Web capture form with URL, notes, and safety explanation.
- Job table with status, progress, attempts, error summary, and retry action.
- Poll active jobs with bounded intervals and stop polling terminal jobs.
- Audit timeline with actor, action, resource, outcome, and timestamp.

### Accessibility and UX

- WCAG 2.2 AA target.
- Keyboard-complete forms and tables.
- Progress is announced to assistive technology.
- Never rely on color alone for status.
- Clearly distinguish collected source content from analyst annotations.

## 7. Implementation Sequence

Each phase must leave the repository building and tests passing.

### Phase 1: Developer environment and migrations

Deliver:

- Pin container image versions.
- Add MinIO health check and bucket initialization.
- Add `.env.test` conventions and environment validation.
- Create initial Prisma migration and repeatable seed.
- Add scripts for `dev:infra`, `dev:bootstrap`, `db:migrate`, `db:reset`, and
  worker startup.
- Make readiness checks verify PostgreSQL, Redis, and object storage.

Acceptance:

- A new checkout reaches a healthy seeded state using documented commands.
- Resetting and reapplying migrations produces the same schema.

### Phase 2: Authentication and authorization

Deliver:

- Session schema and repository.
- Password hashing and login/logout/current-user services.
- Cookie and CSRF middleware.
- Organization context derived from authenticated membership.
- Central policy service and role matrix tests.
- Replace temporary identity headers in case routes.

Acceptance:

- Disabled, expired, revoked, cross-tenant, and insufficient-role requests fail
  closed.
- Session cookies and CSRF behavior are integration-tested.

### Phase 3: Case workspace

Deliver:

- Complete case contracts and application services.
- Case list, create, read, and update endpoints.
- `/cases` and case workspace routes.
- Permission-aware shell and standard loading/error states.

Acceptance:

- An owner or analyst creates and opens a case through the browser.
- A viewer sees only authorized cases and cannot mutate them.

### Phase 4: Evidence ingestion and source register

Deliver:

- Object-storage adapter and development MinIO implementation.
- Streaming multipart ingestion, hashing, type detection, and cleanup.
- Manual evidence application service.
- Evidence list/detail/update/download endpoints.
- Source register UI and provenance view.
- Upload size/type policy configuration.

Acceptance:

- Uploaded bytes round-trip exactly and stored SHA-256 matches an independent
  calculation.
- Interrupted or rejected uploads leave no durable evidence record and are
  cleaned up.
- Cross-case and cross-organization reads are denied.

### Phase 5: Secure web capture

Deliver:

- Connector registry and `web-page-capture` manifest.
- BullMQ producer and worker execution service.
- Network target validator with IPv4/IPv6 and redirect tests.
- Streaming response capture, text extraction, object storage, and provenance.
- Job list/detail/retry API and UI.

Acceptance:

- Public test pages are captured and appear in the source register.
- Private, local, metadata, oversized, redirect-loop, and unsupported targets
  are rejected with stable safe error codes.
- Repeated idempotent submissions do not duplicate jobs or evidence.

### Phase 6: Audit interfaces

Deliver:

- Central audit service applied to all milestone commands and downloads.
- Case audit endpoint and UI timeline.
- Safe metadata allowlist and retention documentation.

Acceptance:

- Login, logout, case mutation, evidence creation/download, job execution,
  retry, denial, and relevant failures have expected audit coverage.
- No API can update or delete an audit event.

### Phase 7: Automated testing and CI

Deliver:

- Unit tests for policies, contracts, hashing, URL validation, and connector
  normalization.
- API integration tests against PostgreSQL, Redis, and MinIO.
- Worker integration tests using controlled local HTTP fixtures.
- Browser end-to-end test for login, case creation, upload, manual evidence,
  source register, web capture, job status, download, and audit view.
- GitHub Actions workflow with service containers and dependency caching.

Acceptance:

- CI passes from a clean clone.
- No test depends on the public internet.
- Flaky retries are not used to conceal nondeterministic tests.

### Phase 8: Documentation and release gate

Deliver:

- Update README setup and troubleshooting.
- Update architecture and API documents to match final behavior.
- Add security assumptions and responsible-use notes for web capture.
- Record known limitations and the next milestone.

Acceptance:

- A new developer can run the workflow using only repository documentation.
- Production build, tests, migrations, and dependency audit pass.

## 8. Test Strategy

### Unit tests

- Authorization matrix for organization and case roles.
- Session expiry, revocation, rotation, and digest comparison.
- Evidence metadata validation and hash computation.
- URL normalization and complete SSRF address classification.
- Redirect revalidation.
- Connector result normalization and error classification.
- Cursor encoding/decoding and stable pagination.

### Integration tests

- Migration from an empty PostgreSQL database.
- Login, CSRF, logout, and revoked-session behavior.
- Cross-tenant and cross-case isolation.
- Idempotent case, upload, and connector commands.
- MinIO upload, promotion, signed download, cleanup, and hash verification.
- Redis queue execution and retry/dead-letter behavior.
- Audit event creation in the same transaction as mutations.

### End-to-end test

Use a seeded owner and a controlled fixture web server:

1. Sign in.
2. Create a case.
3. Add manual evidence.
4. Upload a test PDF or text file.
5. Verify the source register and hash.
6. Queue a fixture web capture.
7. Observe terminal success.
8. Open captured provenance.
9. Download authorized evidence.
10. Confirm audit entries.

## 9. CI Pipeline

Recommended GitHub Actions jobs:

1. `quality`
   - clean install
   - formatting check
   - lint
   - type check
   - Prisma format and validation
2. `unit`
   - unit tests with coverage
3. `integration`
   - PostgreSQL, Redis, and MinIO services
   - apply migrations from empty database
   - integration and worker tests
4. `e2e`
   - build and launch API, web, worker, and fixture server
   - run browser test
5. `build-security`
   - production build
   - production dependency audit
   - secret scanning where available

Require all jobs before merge. Upload logs and screenshots only on failure, and
ensure artifacts contain no secrets or evidence payloads.

## 10. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Cross-tenant data leakage | Mandatory scoped repositories, policy middleware, isolation tests |
| SSRF through URL or redirect | Resolve and classify every hop; block unsafe IPv4/IPv6 ranges |
| Memory exhaustion on upload/capture | Stream bytes and enforce compressed/decompressed limits |
| Orphaned MinIO objects | Temporary namespace, finalization transaction, lifecycle cleanup |
| Duplicate evidence/jobs | Stable idempotency keys and uniqueness constraints |
| Forged content metadata | Server-side MIME detection, byte count, and hash |
| Session theft or CSRF | Opaque digest sessions, secure cookies, rotation, CSRF validation |
| Audit leakage | Metadata allowlist and explicit redaction tests |
| Worker/API divergence | Shared contracts and connector SDK; integration tests |
| CI dependence on external sites | Controlled local fixture servers only |
| Scope expansion | Defer graph, AI, reports, invitations, and cloud deployment |

## 11. Recommended Pull Request Boundaries

1. Infrastructure, migration, seed, and environment scripts.
2. Authentication, session middleware, and authorization policy.
3. Case services, endpoints, and workspace UI.
4. Object storage, file/manual evidence, and source register.
5. Secure web connector, queue flow, and job UI.
6. Audit service and audit UI.
7. Test expansion, CI, and documentation hardening.

Each pull request should include its own tests, migrations when required,
documentation changes, and a concise manual verification path.

## 12. Codex Implementation Prompt

Use the following prompt from the Evidara repository root:

```text
Act as a senior full-stack engineer responsible for delivering a
production-ready startup MVP. Work autonomously through implementation,
verification, and documentation. Do not stop at analysis or a proposed plan.

Repository:
/Users/ttotheq/projects/evidara

Product:
Evidara is an open-source, evidence-centered OSINT investigation workspace.
It must preserve provenance, support human review, enforce responsible-use
guardrails, and keep every conclusion traceable to source evidence.

Read these documents before editing:
- docs/requirements/evidara-osint-platform-prd.md
- docs/architecture/system-architecture.md
- docs/architecture/file-structure.md
- docs/architecture/ui-architecture.md
- docs/architecture/edge-cases.md
- docs/api/endpoints.md
- docs/plans/first-usable-vertical-slice.md

Current technical baseline:
- TypeScript npm workspaces
- Next.js web application in apps/web
- Fastify REST API and GraphQL Yoga in apps/api
- PostgreSQL and Prisma in packages/database
- Redis and BullMQ connector worker in workers/connectors
- MinIO-compatible object storage from Docker Compose
- Shared Zod contracts, ontology, connector SDK, and reporting packages
- Existing case routes use temporary identity headers; replace this mechanism
  with authenticated request context
- Connector and AI workers currently fail closed until adapters are registered

Primary objective:
Implement the complete first usable vertical slice described in
docs/plans/first-usable-vertical-slice.md:
1. Local infrastructure and real database migrations.
2. Authentication, organizations, sessions, and role-based permissions.
3. Case list, case creation, and the case workspace shell.
4. File upload and manual evidence entry.
5. Streaming SHA-256 hashing, MinIO storage, provenance, signed downloads, and
   the source register.
6. A secure web-page capture connector.
7. Audit-log and connector-job APIs and user interfaces.
8. Automated unit, integration, end-to-end tests, and GitHub Actions CI.

Engineering requirements:
- Follow the existing modular-monolith boundaries and repository conventions.
- Keep implementation narrowly scoped to this milestone.
- Use application services and repositories; route handlers must not contain
  domain or persistence logic.
- Use opaque database-backed sessions with Argon2id password hashes, secure
  HTTP-only cookies, session revocation, and CSRF protection.
- Derive identity and organization context from the session. Never trust
  client-provided user or organization identity headers.
- Centralize deny-by-default authorization and test the complete role matrix.
- Scope every tenant-owned query by organization and case.
- Stream uploads and connector responses. Do not buffer unbounded content.
- Calculate SHA-256 server-side while streaming and never trust client hashes,
  MIME types, filenames, or object keys.
- Keep object keys opaque and issue short-lived signed downloads only after an
  authorization decision. Audit downloads.
- Make commands idempotent and use optimistic concurrency where documented.
- For web capture, block loopback, private, link-local, multicast, reserved,
  and cloud metadata targets for IPv4 and IPv6. Revalidate DNS and every
  redirect. Enforce redirect, time, byte, decompression, and MIME limits.
- Do not execute arbitrary page JavaScript in the first secure connector.
- Preserve raw capture artifacts, normalized metadata, hashes, connector
  version, requested/final/canonical URLs, and timestamps.
- Keep audit metadata append-only, allowlisted, and free of secrets or evidence
  content.
- Do not weaken TypeScript strictness or disable security checks to make tests
  pass.
- Do not introduce external SaaS dependencies for core local operation.
- Do not add AI, graph, timeline, notebook, map, report generation, STIX,
  invitations, SSO, or cloud deployment in this milestone.

User experience requirements:
- Retain the existing Evidara visual language.
- Implement /login, /cases, /cases/new, and the case workspace routes for
  overview, sources, jobs, audit, and settings.
- Include complete loading, empty, validation, error, permission-denied, and
  retry states.
- Make permission boundaries visible without relying on hidden buttons alone.
- Meet WCAG 2.2 AA where practical and support keyboard operation.
- Clearly distinguish source content, analyst annotations, and system metadata.

Testing requirements:
- Add focused unit tests for authentication, authorization, hashing, URL/SSRF
  validation, redirects, contracts, and pagination.
- Add API and worker integration tests using PostgreSQL, Redis, MinIO, and a
  controlled local HTTP fixture server.
- Add an end-to-end browser test that signs in, creates a case, adds manual
  evidence, uploads a file, verifies its hash and provenance, runs a web
  capture, observes job completion, downloads evidence, and checks audit events.
- Tests must not use the public internet.
- Add GitHub Actions jobs for quality, unit, integration, end-to-end, production
  builds, Prisma migration validation, and dependency auditing.

Execution approach:
1. Inspect the current working tree and existing code before changing it.
2. Implement in the phases and pull-request boundaries defined in the plan.
3. Keep the application buildable and tests passing after each phase.
4. Create and apply real Prisma migrations; do not use db push as the final
   migration mechanism.
5. Update shared contracts and documentation alongside behavior.
6. Run formatting, linting, type checks, tests, migration validation,
   production builds, Docker configuration validation, and dependency audit.
7. Launch the application and verify the complete workflow in a browser.
8. Review the final diff for security regressions, missing tests, accidental
   generated files, secrets, and unrelated changes.

Completion report:
- Summarize implemented behavior by workstream.
- List migrations and major architectural decisions.
- Report exact verification commands and outcomes.
- State any remaining limitations or known risks.
- Do not claim completion while required tests or the end-to-end workflow fail.
```

