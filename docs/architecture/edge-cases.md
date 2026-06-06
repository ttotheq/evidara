# Edge Cases and Failure Policy

## Collection

- Duplicate submission: stable idempotency keys return the original job.
- Source changes during capture: preserve each observation as a new version.
- Redirect loops or hostile payloads: enforce redirect, size, MIME, and time
  limits before persistence.
- SSRF: block private, loopback, link-local, metadata, and disallowed schemes
  after every DNS resolution and redirect.
- Rate limiting or source outage: retry only retryable failures with jitter;
  preserve the last error and respect `Retry-After`.
- Partial capture: retain it only when clearly marked incomplete and useful.
- Robots/terms conflict: connector policy can block collection and records why.
- File hash collision: use SHA-256 plus size and object metadata; never silently
  merge analyst records solely by hash.

## Evidence and ontology

- Same fact from multiple sources: keep distinct observations linked to a
  canonical entity.
- Conflicting sources: preserve both and model `supports`/`contradicts`; do not
  overwrite.
- Entity merge mistake: redirects and merge history make the operation
  reversible.
- Deleted or archived source: retain the authorized capture and provenance;
  apply legal deletion workflows where required.
- Time ambiguity: store original text, parsed instant/range, timezone, and
  parser confidence separately.
- Geocoding ambiguity: require analyst selection before a location becomes an
  accepted fact.
- Confidence changes: append review decisions rather than erasing prior values.

## Collaboration and security

- Simultaneous edits: optimistic concurrency rejects stale writes and offers a
  merge path.
- Membership revoked mid-session: authorize every request; revoke active
  sessions for high-risk cases.
- Last owner removal: block it until ownership is transferred.
- Case handling level raised: immediately invalidate cached permissions and
  previously issued download URLs.
- Export after evidence changes: exports are immutable snapshots with a manifest
  of record versions and hashes.
- Tenant leakage: organization and case scopes are mandatory repository inputs,
  backed by database constraints and isolation tests.

## AI

- No supporting citation: suggestion is invalid and cannot be accepted as a
  finding.
- Model returns malformed output: fail the run without persisting partial facts.
- Context exceeds limit: chunk deterministically and expose omitted material.
- Prompt injection in evidence: evidence is treated as untrusted quoted data;
  tools and system policy are not controlled by evidence text.
- Provider outage or quota exhaustion: preserve the run for retry and do not
  silently switch providers when case policy forbids it.
- Sensitive case with external provider disabled: route only to an approved
  local model or block the workflow.

## Operations

- Database succeeds but queue publish fails: transactional outbox republishes.
- Worker crashes after upload: lifecycle rules clean temporary objects; stable
  job IDs make finalization idempotent.
- Search index corruption: rebuild from PostgreSQL and object metadata.
- Object storage unavailable: metadata may remain readable, but downloads and
  new captures fail closed.
- Backup restore mismatch: verify database evidence hashes against object
  storage manifests during restore drills.

