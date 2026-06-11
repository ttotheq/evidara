# Component Catalog

Source of truth: `apps/web/app/styles.css`. Live rendering of everything
below: the development-only `/design-system` route (returns 404 in
production builds). Tokens behind these components: `tokens.md`.

Scope note: this catalogs the de facto component set the vertical slice
shipped. Phase 2 deliberately made **no** pixel-affecting consolidations;
known overlaps are recorded in §Audit decisions at the end.

## Application shell

| Component | Classes | Notes |
| --- | --- | --- |
| Top bar | `.topbar`, `.topbarLeft`, `.topbarRight` | 72px fixed height; hairline bottom border |
| Brand | `.brand`, `.brandMark` | Accent square monogram plus wordmark; links home |
| Organization switcher | `.orgSwitcher` | A standard `<select>`, max-width 240px; rendered only with multiple memberships, otherwise a static pill |
| User name | `.userName` | Muted, `--text-md` |
| App frame | `.appFrame`, `.appBody` | Column flex; body fills remaining height |
| Loading state | `.appLoading` | Full-viewport centered muted text; `aria-live="polite"` |
| Screen-reader text | `.srOnly` | Visually hidden, accessible name preserved |

The theme toggle is a `.buttonSecondary` in `.topbarRight`
(`apps/web/lib/theme.tsx`); its accessible name states the target theme
("Switch to light theme").

## Buttons

| Component | Classes | Usage |
| --- | --- | --- |
| Primary | `.buttonPrimary` | One primary action per view; accent surface, `--accent-ink` text, weight 800. Works on `<button>` and `<Link>` |
| Secondary | `.buttonSecondary` | Everything else: cancel, retry, sign out, load more. Hairline border, transparent surface |
| Link button | `.linkButton` | A `<button>` that reads as text — row titles that open drawers. Inherits font; no padding |
| Modal close | `.modalClose` | Compact bordered button for modal/drawer headers |
| Legacy element style | bare `button` | Marketing page and auth card submit; slightly larger padding than `.buttonPrimary` (see §Audit decisions) |

States: `[disabled]` drops opacity to 0.55 and removes the pointer cursor;
busy buttons also swap their label ("Uploading…") and the surrounding form
sets `aria-busy`. Focus visibility is global: 2px accent outline, offset 2.

Rule: never indicate a permission boundary by hiding the button alone —
pair with an explanatory pill (see Permission pill below).

## Pills and status

| Component | Classes | Usage |
| --- | --- | --- |
| Pill | `.pill` | Status chips in tables (kind, review state, job status), org name, read-only notices |
| Handling-level pill/banner variants | `.handling-sensitive`, `.handling-restricted` | Border tint only (amber / red). `handling-public` and `handling-internal` are emitted by templates but intentionally unstyled — default look |
| Audit outcome variants | `.auditOutcome-denied`, `.auditOutcome-failure` | `--danger-accent` border, `--danger-accent-ink` text. `auditOutcome-success` is emitted and intentionally unstyled |
| Permission pill | `.pill` with `title` | "Read-only register", "Retry not permitted for your role" — visible explanation of a denied affordance |
| Status (marketing) | `.status` | Same recipe as `.pill`; marketing page only |

Rule: never rely on the tint alone — variant pills always carry text
naming the state (WCAG: not color-only).

## Forms

| Component | Classes | Usage |
| --- | --- | --- |
| Inputs | bare `input`, `select`, `textarea` | Full-width, panel surface, hairline border, `--radius-control` |
| Label | bare `label` | Block, bold `--text-sm`; every control has one (or `.srOnly` for filter bars) |
| Stacked form | `.stackedForm` | Vertical label/control rhythm for dialogs and pages |
| Field hint | `.fieldHint` | Muted `--text-sm` paragraph directly after a control |
| Error box | `.formError` | Danger surface/border/ink; rendered with `role="alert"`. Never assert on bare `[role=alert]` in tests — Next.js injects a route announcer with that role |
| Success box | `.formSuccess` | Success surface/border/ink |
| Form actions | `.formActions` | Horizontal button row, primary first |
| Disabled group | `fieldset:disabled` | Whole-form lockout during submit, opacity 0.6 |
| Filter bar | `.filterBar` | Search input (flex 1) plus auto-width selects/dates; wraps under 760px |

## Data display

| Component | Classes | Usage |
| --- | --- | --- |
| Data table | `.dataTable` | Hairline-bordered, uppercase `--text-xs` muted headers, panel hover rows |
| Row link | `.rowLink` (+ `.linkButton`) | Title cell affordance opening a drawer |
| Cell subtext | `.cellSub` | Muted second line in a cell (filename, connector key) |
| Hash value | `.hashValue` | Mono `--text-xs`, wraps anywhere; SHA-256, error codes |
| Progress | `.dataTable progress` | 90px, accent color; pair with `aria-label` announcing percent |
| Load more | `.loadMoreRow` | Centered secondary button; the retry affordance for pagination failures is the button itself |
| Detail list | `.detailList` | Two-column dt/dd grid; single column inside drawers |
| Panel | `.panel`, `.overviewGrid` | Surface card with `--text-lg` heading; overview two-up grid |
| Empty state | `.emptyState` | Dashed border, serif heading, teaching copy — must state the next safe action |
| State note | `.stateNote` | Muted inline status ("Loading evidence…"); `aria-live="polite"` for async updates |
| Notice box | `.noticeBox` | Muted informational panel |

## Case workspace

| Component | Classes | Usage |
| --- | --- | --- |
| Case frame | `.caseFrame` | Width-constrained workspace wrapper |
| Handling banner | `.handlingBanner` (+ handling variants) | Always-visible classification banner under the top bar |
| Case header | `.caseHeaderBar` | Title row with breadcrumb eyebrow |
| Tabs | `.caseTabs`, `.caseTab`, `.caseTabActive` | `<nav aria-label="Case sections">`; active tab gets accent underline and `aria-current="page"` |

## Overlays

| Component | Classes | Usage |
| --- | --- | --- |
| Modal | `.modal`, `.modalHeader`, `.modalClose` | Native `<dialog>` via `showModal()`; backdrop token; cancel event closes |
| Drawer | `.drawer`, `.drawerHeader`, `.drawerActions`, `.drawerSectionTitle` | Right-edge fixed panel, `role="dialog"` with `aria-label`; used for provenance and job detail |
| Attempt list | `.attemptList` | Ordered list of connector attempts inside the job drawer |

## Audit timeline

| Component | Classes | Usage |
| --- | --- | --- |
| Timeline | `.auditTimeline`, `.auditEvent` | Hairline-separated list, newest first |
| Event head | `.auditEventHead` | Action label plus outcome pill |
| Event meta | `.auditEventMeta` | Muted actor/resource/timestamp line |

## Page scaffolding

| Component | Classes | Usage |
| --- | --- | --- |
| Page | `.page`, `.pageNarrow` | Width-constrained content column |
| Page header | `.pageHeader`, `.pageTitle`, `.pageLede` | Serif display title with muted lede |
| Eyebrow | `.eyebrow` | Accent uppercase kicker above titles |
| Muted | `.muted` | Inline muted text utility |

## Marketing page

`.hero`, `.caseCard`, `.caseHeader`, `.confidence`, `.capabilities`,
`.grid`, `article` — the pre-app landing page. Uses the same tokens
(serif display, accent, hairlines) but its own layout; not for use inside
the application.

## Audit decisions (Phase 2, 2026-06-10)

1. **No dead selectors.** Every class in `styles.css` is referenced;
   four are template-constructed (`handling-*`, `auditOutcome-*`) and
   invisible to a plain grep — checked against the template expressions.
2. **No pixel-affecting consolidation.** The two real overlaps both
   change computed styles if merged, so they are documented instead:
   the bare `button` element style (14/20 padding) vs `.buttonPrimary`
   (12/18) — merging would resize the marketing and login submit
   buttons; and the bare `dl` grid (marketing, three columns) which
   `.detailList` partially overrides — fragile cascade, but rewriting it
   moves marketing layout. Both are queued with the spacing
   normalization debt from `tokens.md` for a deliberate visual-change
   pass.
3. **Intentionally unstyled variants** (`handling-public`,
   `handling-internal`, `auditOutcome-success`) are a feature: the
   default look means "nothing unusual"; styling is reserved for states
   that demand attention.
