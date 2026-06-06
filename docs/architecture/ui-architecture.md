# UI Architecture

## Route model

```text
/(auth)/login
/(app)/cases
/(app)/cases/[caseId]/overview
/(app)/cases/[caseId]/sources
/(app)/cases/[caseId]/graph
/(app)/cases/[caseId]/timeline
/(app)/cases/[caseId]/map
/(app)/cases/[caseId]/notebook
/(app)/cases/[caseId]/findings
/(app)/cases/[caseId]/reports
/(app)/cases/[caseId]/settings
/(app)/admin/connectors
/(app)/admin/members
```

## Composition

- Server components load identity, case shell, permissions, and initial data.
- Client components are reserved for graph interaction, map interaction,
  notebook editing, uploads, and optimistic command feedback.
- URL search parameters are the source of truth for filters and selected views.
- TanStack Query owns server-state caching for interactive client surfaces.
- Local component state owns only ephemeral UI state.
- A shared case shell provides navigation, handling-level banner, job activity,
  and permission-aware actions.

## Feature boundaries

```text
features/
├── cases
├── collection
├── evidence
├── graph
├── timeline
├── map
├── notebook
├── findings
├── ai-suggestions
├── reports
└── governance
```

Each feature owns UI, browser-side schemas, query keys, and command hooks. It
imports design-system primitives and generated contracts, never another
feature's internal components.

## UX rules

- Every displayed assertion exposes its source and confidence in one action.
- AI-generated content is visually distinct until accepted.
- Destructive, high-risk, and bulk actions show scope before confirmation.
- Empty states teach the next safe action.
- Job failures show a human-readable reason, retry eligibility, and provenance.
- Accessibility target is WCAG 2.2 AA, including keyboard graph navigation and
  non-visual alternatives for graph, map, and timeline content.

