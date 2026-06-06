# Evidara PRD

## Product Name

**Evidara**

**Name rationale:** Palantir drew power from a constructed, mythic-feeling word associated with "seeing from afar." Evidara is built in the same spirit, but with a more open and accountable center: **evidence + afar + ara**. The name suggests "evidence from a distance" and "a vessel for verified signals." It feels ancient without borrowing Tolkien IP, and it keeps the product promise focused on source-linked truth rather than surveillance mystique.

**Tagline:** Open intelligence, source by source.

## Research Snapshot

### What Palantir Teaches Us

Palantir's current platform story is not a single dashboard. It is an integrated operating layer made of:

- **Foundry:** a data operations platform for data management, logic authoring, ontology development, analytics, and workflow development.
- **AIP:** a generative AI platform that connects models to governed operational workflows, agents, automations, evals, and applications.
- **Apollo:** a continuous delivery and control layer for deploying and managing software across environments.
- **Gotham:** a defense and intelligence operating system built on the same underlying ontology and multimodal application layer.

The recurring product pattern is: ingest data, structure it into a shared ontology, let humans and agents reason over that ontology, apply strict access and audit controls, then operationalize the result through applications and workflows.

### OSINT Landscape

The open-source intelligence market already has useful tools, but they are fragmented:

- **OpenCTI** focuses on cyber threat intelligence knowledge management, observables, STIX2, relations, confidence, and source-linked threat context.
- **MISP** focuses on collecting, storing, correlating, analyzing, and sharing threat intelligence across communities.
- **SpiderFoot** focuses on automating OSINT collection across many public and commercial sources for reconnaissance and investigation.
- **Maltego-like graph tools** focus on relationship discovery and link analysis, often with commercial data integrations.

The opportunity for Evidara is to become an open-source, general-purpose OSINT operating layer: not just a collector, not just a graph, and not only cyber threat intelligence.

## Product Thesis

OSINT analysts need a transparent, reproducible, and collaborative way to turn public signals into defensible intelligence products.

Evidara will be an open-source OSINT platform that:

- Collects public data through modular connectors.
- Preserves source provenance, timestamps, confidence, and chain of custody.
- Structures people, organizations, domains, locations, events, assets, claims, and documents into an investigation ontology.
- Provides graph, map, timeline, notebook, and report views.
- Uses AI to summarize, cluster, extract entities, suggest links, and draft reports, while requiring human review for conclusions.
- Embeds legal, ethical, and safety guardrails into the workflow.

## Target Users

### Primary

- Investigative journalists verifying public claims, networks, organizations, or events.
- Security researchers investigating exposed infrastructure, phishing campaigns, fraud networks, and public threat indicators.
- NGO and human-rights researchers documenting open-source evidence.
- Corporate trust, safety, and risk teams conducting due diligence or exposure research.

### Secondary

- Educators teaching OSINT methodology.
- Local civic researchers and transparency groups.
- Open-source intelligence communities that need shared casework without proprietary lock-in.

## Problem Statement

OSINT work is often scattered across browser tabs, spreadsheets, screenshots, scripts, paid tools, and private notes. This creates four recurring failures:

- **Weak provenance:** analysts lose where a fact came from, when it was observed, and whether the source changed.
- **Poor reproducibility:** another analyst cannot reliably recreate the collection path or verify the conclusion.
- **Fragmented reasoning:** graph links, timelines, maps, notes, and source files live in different tools.
- **Unsafe acceleration:** AI can summarize too confidently, reveal sensitive information, or blur source evidence with analyst inference.

## Goals

- Make OSINT investigations reproducible and source-linked by default.
- Give small teams Palantir-like ontology, graph, workflow, and AI-assisted analysis capabilities without closed-source lock-in.
- Support multiple investigation domains, starting with cyber, organization, person, domain, document, geospatial, and event analysis.
- Build a contributor-friendly connector ecosystem.
- Treat ethics, auditability, and responsible use as product requirements, not policy afterthoughts.

## Non-Goals

- Evidara will not provide covert collection, hacking tooling, credential theft, doxxing workflows, or surveillance-as-a-service.
- Evidara will not make fully automated allegations or attribution claims.
- Evidara will not ship with paid data-broker integrations in the MVP.
- Evidara will not attempt to replace OpenCTI or MISP for specialized CTI sharing in v1; it should integrate with them.

## MVP Scope

### 1. Case Workspace

Users can create a case with:

- Objective, scope, legal basis or research justification, and handling notes.
- Team members and role-based access.
- Source inventory.
- Evidence board.
- Notes, tasks, and findings.
- Exportable investigation report.

### 2. OSINT Connector Framework

MVP connectors:

- Web page capture with HTML, text extraction, screenshot, hash, timestamp, and canonical URL.
- Domain and DNS lookup.
- WHOIS/RDAP lookup.
- Certificate transparency lookup.
- IP/ASN lookup.
- Public GitHub repository and user metadata lookup.
- RSS/news feed ingestion.
- Uploaded files: PDF, image, CSV, JSON, TXT.
- Manual evidence entry.

Connector requirements:

- Every connector must declare source, method, rate limits, data fields, license or terms notes, and safety classification.
- Every result must preserve raw response, normalized fields, collection timestamp, connector version, and analyst notes.

### 3. Investigation Ontology

Core entities:

- Person
- Organization
- Account
- Domain
- IP address
- URL
- Email
- Phone number
- Location
- Event
- Document
- Image
- Claim
- Asset
- Source
- Evidence item

Core relations:

- owns
- operates
- mentioned_in
- observed_at
- linked_to
- resolved_to
- registered_by
- affiliated_with
- located_at
- claims
- contradicts
- supports
- derived_from

Each entity and relation must include:

- Source reference.
- Confidence score.
- Visibility/handling level.
- Created by / modified by.
- Timestamps.
- Optional reviewer approval.

### 4. Analyst Views

MVP views:

- **Graph:** entities and relationships, filters by type, source, confidence, and time.
- **Timeline:** events, observations, publication dates, and collection dates.
- **Map:** geocoded locations and event clusters.
- **Source Table:** sortable evidence register with provenance metadata.
- **Notebook:** structured notes with citation chips that link back to evidence.
- **Report Builder:** findings, methodology, evidence appendix, confidence language, and export to Markdown/PDF.

### 5. AI Assistance

AI features must be assistive, reviewable, and evidence-bound:

- Entity extraction from text and PDFs.
- Deduplication suggestions.
- Link suggestions between entities.
- Timeline summarization.
- Source reliability prompts.
- Contradiction detection.
- Report outline and draft generation.

AI constraints:

- AI output cannot create final findings without analyst confirmation.
- Every AI-generated claim must cite source evidence or be marked as an inference.
- The platform must show which model, prompt version, evidence context, and timestamp produced each AI suggestion.
- Sensitive cases can disable external model calls and use local models only.

### 6. Governance and Safety

Required:

- Role-based permissions.
- Case-level audit log.
- Source access log.
- Evidence immutability option.
- Export watermarking.
- Abuse prevention policy.
- Safety warnings for personal data, minors, private citizens, and high-risk investigations.
- Built-in confidence and estimative language templates.

## Core User Journeys

### Journey 1: Investigative Journalist

1. Creates a case about a public procurement network.
2. Adds company names, domains, filings, articles, and archived pages.
3. Evidara extracts people, organizations, addresses, and claims.
4. Analyst reviews suggested links and rejects weak associations.
5. Timeline reveals repeated contract awards after specific events.
6. Report Builder exports a source-linked findings document.

### Journey 2: Security Researcher

1. Enters a suspicious domain.
2. Runs passive DNS, RDAP, certificate transparency, IP/ASN, and web capture connectors.
3. Graph view shows related infrastructure and certificates.
4. AI suggests a cluster of domains with similar registration patterns.
5. Analyst confirms confidence and exports IOCs to STIX/MISP-compatible format.

### Journey 3: NGO Research Team

1. Uploads public reports, social posts, images, and news articles.
2. Uses timeline and map views to organize incident evidence.
3. Tags source reliability and confidence.
4. Collaborators review claims before publication.
5. Exports an evidence appendix with archived sources and hashes.

## Functional Requirements

### Case Management

- Create, duplicate, archive, and export cases.
- Add collaborators with roles: owner, analyst, reviewer, viewer.
- Define case scope and prohibited collection boundaries.
- Maintain case-level audit history.

### Data Collection

- Run connectors manually.
- Queue connector jobs.
- Store raw and normalized results.
- Retry failed connector jobs.
- Display connector provenance and limits.
- Respect robots, site terms notes, and rate limits where applicable.

### Evidence Management

- Store source files and captures.
- Generate SHA-256 hashes for evidence files.
- Track collection time and observed publication time separately.
- Support analyst annotations.
- Mark evidence as verified, disputed, stale, or excluded.

### Ontology and Graph

- Create entities from connector output, AI extraction, or manual entry.
- Merge duplicates with reversible history.
- Create typed relationships with source citations.
- Filter graph by time, source, confidence, entity type, and reviewer status.

### Search

- Full-text search across notes, sources, entities, and connector results.
- Faceted search by entity type, source, tag, confidence, and case.
- Saved searches.

### Reports

- Build structured findings.
- Insert citations from evidence.
- Export Markdown and PDF in MVP.
- Include methodology, confidence rubric, source list, and appendix.

### Integrations

- Import/export STIX2 bundles.
- Export CSV and JSON.
- Optional MISP export in v1.
- Optional OpenCTI export/import in v1.

## Non-Functional Requirements

- Self-hostable with Docker Compose for MVP.
- Runs locally for single-user cases.
- PostgreSQL for core relational data.
- Object storage-compatible evidence store.
- Graph query layer using PostgreSQL plus graph extensions initially, with a path to Neo4j or Apache AGE if needed.
- Background job queue for connectors.
- OpenAPI and GraphQL APIs.
- Default secure configuration.
- No telemetry by default; opt-in anonymous project health metrics only.
- All audit events append-only.

## Suggested Architecture

### Frontend

- Web app with case workspace, graph, timeline, map, source table, notebook, and report builder.

### Backend

- API service for users, cases, entities, evidence, search, reports, and permissions.
- Connector worker service.
- AI worker service.
- Export service.
- Audit service.

### Storage

- PostgreSQL for cases, ontology, permissions, and metadata.
- OpenSearch or Meilisearch for full-text search.
- S3-compatible object storage for evidence files and captures.
- Optional graph database adapter after MVP if relationship scale requires it.

### AI Layer

- Provider abstraction for local and hosted models.
- Prompt/version registry.
- Evidence-bounded retrieval.
- AI suggestion queue requiring human accept/reject.
- Evaluation fixtures for extraction, deduplication, hallucination, and citation accuracy.

## Open Source Strategy

Recommended license: **AGPL-3.0** for the core platform if the goal is to keep hosted modifications open; **Apache-2.0** if maximum enterprise adoption is preferred.

Repository structure:

- `apps/web`
- `apps/api`
- `workers/connectors`
- `workers/ai`
- `packages/ontology`
- `packages/connectors-sdk`
- `packages/reporting`
- `docs`

Community model:

- Public roadmap.
- Connector contribution guide.
- Safety review for new connectors.
- Example investigations using synthetic data.
- Governance board for responsible use and abuse handling.

## Success Metrics

MVP success:

- Analyst can complete a source-linked investigation from collection to report without leaving the platform.
- 10+ connectors available.
- 95% of report claims cite evidence items.
- AI extraction precision target: 85% on benchmark documents.
- Median connector job failure rate below 5%.
- New connector can be built from SDK template in under one day.

Community success:

- 500 GitHub stars within 90 days of public launch.
- 25 external contributors within six months.
- 20 community connectors within six months.
- At least three public case-study workflows using synthetic or public-safe data.

## Roadmap

### Phase 0: Design Prototype

- Finalize ontology.
- Build clickable UI prototype.
- Write connector SDK spec.
- Define responsible-use policy.
- Create synthetic demo dataset.

### Phase 1: MVP

- Case workspace.
- Connector jobs.
- Evidence register.
- Entity graph.
- Timeline.
- Notebook.
- Markdown/PDF report export.
- Basic AI extraction and summarization.

### Phase 2: Collaboration and Interop

- Reviewer workflow.
- MISP and OpenCTI integrations.
- STIX import/export.
- Case templates.
- Advanced search.
- Connector marketplace.

### Phase 3: Advanced Analysis

- Geospatial clustering.
- Contradiction and source drift detection.
- Local model bundle.
- Report redaction tools.
- Multi-case knowledge base.
- Reproducible investigation packages.

## Key Risks

- **Misuse risk:** OSINT tooling can be abused for harassment or unlawful targeting. Mitigation: safety policy, connector review, purpose logging, high-risk warnings, and no covert collection features.
- **AI overclaiming:** Model-generated findings may appear more certain than the evidence supports. Mitigation: evidence-bound AI, citation requirements, confidence language, and human approval.
- **Source fragility:** Public sources change or disappear. Mitigation: capture snapshots, hashes, archive metadata, and collection timestamps.
- **Scope creep:** OSINT is broad. Mitigation: start with source provenance, case workflow, and a small set of high-value connectors.
- **Data sensitivity:** Public data can still be personal or dangerous. Mitigation: handling levels, redaction, access controls, and export warnings.

## Competitive Differentiation

Evidara should not try to out-Palantir Palantir. Its advantage is openness, reproducibility, and trust.

Compared with existing tools:

- More general-purpose than OpenCTI while still supporting CTI workflows.
- More case-centered and evidence-centered than SpiderFoot.
- More transparent and self-hostable than commercial graph investigation tools.
- More AI-native than traditional OSINT notebooks, but with source-bound constraints.
- More accountable than closed "black box" intelligence platforms.

## Source Notes

- Palantir describes its standard architecture as AIP, Foundry, and Apollo, with Foundry as the data operations layer, AIP as the generative AI layer, and Apollo as the delivery/control layer: https://www.palantir.com/docs/foundry/architecture-center/platforms
- Palantir's 2025 Form 10-K describes Gotham, Foundry, Apollo, and AIP as principal platforms, with Foundry centered on interconnected data, logic, and action, and AIP focused on operational AI and LLMs: https://investors.palantir.com/files/2025%20FY%20PLTR%2010-K.pdf
- OpenCTI describes itself as an open-source platform for managing cyber threat intelligence knowledge and observables, using STIX2 and source-linked relations: https://github.com/OpenCTI-Platform/opencti
- MISP positions itself as an open-source threat intelligence and sharing platform for storing, correlating, analyzing, and sharing threat information: https://www.misp-project.org/index.html
- SpiderFoot describes itself as an open-source OSINT automation framework that gathers, analyzes, and visualizes data from many sources: https://spiderfoot.org/
- Palantir's name is widely reported as originating from Tolkien's palantiri, "seeing stones" associated with seeing at a distance. The product inspiration for Evidara is the naming pattern, not the IP: https://en.wikipedia.org/wiki/Palant%C3%ADr

