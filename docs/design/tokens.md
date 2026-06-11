# Design Tokens

Source of truth: the `:root` block in `apps/web/app/styles.css` (dark
default) and the `:root[data-theme="light"]` override block. This document
explains the roles, records the audit decisions behind the token set, and
holds the verified contrast matrix.

Rules:

- New CSS uses tokens. A raw value needs an inline comment justifying why
  no token fits. Review enforces this; no lint tooling polices it.
- Light theme overrides **color tokens only**. Typography, shape, and
  layout are theme-invariant.
- Dark is the default. The light theme applies only when
  `<html data-theme="light">` is set — written by the theme toggle in the
  application shell and replayed before first paint by the bootstrap
  script in `apps/web/lib/theme.tsx` (preference key `evidara.theme`).

## Color tokens

### Core roles

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--background` | `#08100e` | `#f6f4ec` | Page background |
| `--panel` | `#111816` | `#fdfcf7` | Raised surfaces: cards, modals, drawers, inputs, hover rows |
| `--ink` | `#f1eee6` | `#1c2420` | Primary text |
| `--muted` | `#a7aaa5` | `#5a625c` | Secondary text, labels, metadata |
| `--line` | `#29312f` | `#d8ddd4` | Hairline borders and separators |
| `--accent` | `#bbf28c` | `#3c6e23` | Brand green: primary buttons, active tab, focus rings, eyebrow text |
| `--accent-ink` | `#0c150d` | `#f7faf2` | Text on accent surfaces |

### Feedback

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--danger-border` | `#7a3a3a` | `#c98d83` | Error box border; RESTRICTED handling banner |
| `--danger-surface` | `#2a1414` | `#f7e4e0` | Error box background |
| `--danger-ink` | `#f3c2c2` | `#8a2a20` | Error box text |
| `--success-border` | `#3a5a3a` | `#8fae7c` | Success box border |
| `--success-surface` | `#14210f` | `#e9f2dd` | Success box background |
| `--success-ink` | `#cdf3c2` | `#2c511a` | Success box text |
| `--warning-border` | `#6b5a2a` | `#a8893f` | SENSITIVE handling banner border |
| `--danger-accent` | `#b3563f` | `#b3563f` | Denied/failed outcome pill border |
| `--danger-accent-ink` | `#d98b76` | `#9c4530` | Denied/failed outcome pill text |

### Decorative

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--card-gradient-start` | `#151f1c` | `#ffffff` | Marketing case-card gradient |
| `--card-gradient-end` | `#0e1513` | `#f3f1e8` | Marketing case-card gradient |
| `--card-border` | `#34413d` | `#d3d9d0` | Marketing case-card border |
| `--track` | `#26302d` | `#dde3d8` | Meter/progress track |
| `--backdrop` | `rgba(4,8,7,0.72)` | `rgba(25,32,28,0.45)` | Modal backdrop |
| `--shadow-card` | `0 30px 80px #0008` | `0 30px 80px rgba(25,32,28,0.16)` | Marketing card shadow |
| `--shadow-drawer` | `-24px 0 48px rgba(4,8,7,0.5)` | `-24px 0 48px rgba(25,32,28,0.18)` | Drawer shadow |

## Typography tokens

| Token | Value | Role |
| --- | --- | --- |
| `--font-sans` | Inter, ui-sans-serif, system-ui, … | Default UI face |
| `--font-serif` | Georgia, serif | Display headings |
| `--font-mono` | ui-monospace, SFMono-Regular, Menlo, monospace | Hashes, error codes, technical identifiers |
| `--text-xs` | 12px | Eyebrows, table headers, metadata, hashes |
| `--text-sm` | 13px | Pills, labels, hints, attempt lists |
| `--text-md` | 14px | Form feedback, tabs, drawer section titles |
| `--text-base` | 15px | Detail-list values |
| `--text-lg` | 16px | Panel headings |
| `--text-xl` | 18px | Modal/drawer headings |
| `--text-2xl` | 20px | Marketing article headings |
| `--text-3xl` | 22px | Marketing stat values |
| `--text-4xl` | 28px | Empty-state headings |
| `--text-5xl` | 32px | Auth/marketing card headings |
| `--display-page` | clamp(30px, 4vw, 44px) | Page titles |
| `--display-section` | clamp(38px, 5vw, 68px) | Marketing section headings |
| `--display-hero` | clamp(54px, 7vw, 104px) | Marketing hero |
| `--text-lede` | clamp(18px, 2vw, 22px) | Marketing lede |

## Shape tokens

| Token | Value | Role |
| --- | --- | --- |
| `--radius-control` | 7px | Inputs, buttons, banners, notice boxes |
| `--radius-surface` | 14px | Cards, panels, modals, empty states |
| `--radius-pill` | 999px | Pills and status chips |
| `--radius-bar` | 4px | Meter/progress bars |

## Contrast matrix (WCAG 2.2 AA)

Computed from relative luminance per WCAG; normal text requires ≥ 4.5:1.
All shipped text pairs pass AA in both themes; most pass AAA (≥ 7:1).

| Text on surface | Dark | Light |
| --- | --- | --- |
| `--ink` on `--background` | 16.61 | 14.42 |
| `--ink` on `--panel` | 15.53 | 15.46 |
| `--muted` on `--background` | 8.19 | 5.72 |
| `--muted` on `--panel` | 7.66 | 6.13 |
| `--accent` as text on `--background` | 14.84 | 5.53 |
| `--accent-ink` on `--accent` | 14.35 | 5.78 |
| `--danger-ink` on `--danger-surface` | 11.01 | 7.04 |
| `--success-ink` on `--success-surface` | 13.71 | 7.92 |
| `--danger-accent-ink` on `--background` | 7.25 | 5.77 |
| `--danger-accent-ink` on `--panel` | 6.78 | 6.18 |

Re-verify this matrix whenever a color token changes (the computation is a
ten-line script over the WCAG relative-luminance formula; keep the table in
sync with `styles.css`).

## Audit decisions (Phase 1, 2026-06-10)

1. **Dark values are byte-identical to the pre-token stylesheet.** Parity
   with the shipped slice UI is guaranteed by construction, not by
   eyeballing: the refactor only named existing values.
2. **The undefined `--danger` variable is gone.** The audit-outcome pills
   referenced `var(--danger, fallback)` with two different fallbacks; the
   rendered values (`#b3563f` border, `#d98b76` text) are now the explicit
   `--danger-accent` / `--danger-accent-ink` tokens.
3. **Monospace stacks unified.** The marketing capability index used a
   shorter mono stack than `.hashValue`; both now use `--font-mono`. On
   every platform the resolved face is unchanged or imperceptibly close.
4. **Spacing is deliberately not tokenized yet.** The de facto spacing is
   an irregular enumeration (3–120px, ~26 distinct values), not a scale.
   Tokenizing it 1:1 would create dozens of single-use tokens — noise
   posing as system — and normalizing it to a real scale would change
   pixels, which Phase 1 forbids. Decision: spacing literals stay;
   normalization to a 4px-base scale is design debt for a deliberate
   visual-change pass after this milestone's parity constraint lifts.
5. **Border widths stay literal.** 1px hairlines and the 2px active-tab
   underline are structural; their colors are tokens.
6. **No motion tokens.** The interface currently defines zero transitions
   or animations. Introducing motion is a design decision for the
   prototype phases, not a refactor byproduct; tokens will be added with
   the first real use.
7. **`::backdrop` inherits custom properties** in the browsers this
   project targets (modern evergreen); the backdrop color is a token. If a
   deployment ever targets older engines, this is the one token usage to
   re-check.
8. **Light palette derivation.** Light values were chosen per role to
   preserve the warm green-on-paper character of the dark theme and tuned
   until the full contrast matrix passed AA (most pairs AAA). The light
   accent is a deep green rather than the dark theme's pale green because
   `--accent` doubles as small bold text (eyebrows), which must hold 4.5:1
   against the page background.
