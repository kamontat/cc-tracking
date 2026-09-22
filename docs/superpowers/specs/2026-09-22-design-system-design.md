# cc-tracking — Design system on reset.css and shadow DOM

Date: 2026-09-22
Status: Approved for implementation planning
Follows: `docs/superpowers/specs/2026-09-21-location-i18n-cloudflare-design.md`

## Problem

The site is styled by `@picocss/pico`, loaded as a document stylesheet from each
route's entry module. A document stylesheet does not cross a shadow boundary, so
Pico only ever styled the light DOM: the nav, the `<h1>`/`<h2>`/`<article>`
elements the routes render into `#page`, and nothing else. Six of the eight
components render into a shadow root with no styles of their own, and the two
that do (`cc-due-list`, `cc-error-banner`) carry a handful of ad-hoc rules with
hardcoded hex values and `var(--pico-*)` fallbacks that resolve to the fallback
in practice, because those Pico variables are not inherited across the boundary
either.

The result: page chrome looks designed, everything inside a component does not,
and there is no shared vocabulary for spacing, color, or type. On a phone the
two tables overflow horizontally and the dashboard is a single unbroken column.

## Goal

Replace Pico with `@kcstyles/reset.css` plus a small design system that works in
both the light DOM and every shadow root from one set of values, and rework the
layout of all three pages around it.

## Scope

In scope: the style system (tokens, shared component styles, page shell), styles
for all eight components, the layout of the dashboard, card registry and card
detail pages, responsive behaviour, dark mode, and the button-variant rename
that follows from dropping Pico's class names.

Out of scope: any change to domain logic, storage, i18n message text, component
events or props; new pages; new features; a `<cc-nav>` component (see
"Decisions"); web fonts.

## What the reset gives, and what it takes away

`@kcstyles/reset.css@1.0.12` (single export, `import "@kcstyles/reset.css"`) is
a Tailwind-preflight derivative. It normalises the box model, zeroes margins on
headings, paragraphs and lists, removes list markers, strips heading font sizes
and weights to `inherit`, resets links to `color: inherit; text-decoration:
inherit`, and removes native button appearance. It sets a system sans stack and
`line-height: 1.5` on `html`. It is the opposite of Pico: it has no opinions to
inherit, so every visible style in the app becomes ours to write.

Three rules at the end of the file are opinionated and must be designed around
rather than discovered later:

```css
div { display: flex; flex-direction: column; }
div[row=""] { display: flex; flex-direction: row; }
div[block=""] { display: block; }
.dark { color-scheme: dark; }
```

Every `div` in the light DOM is a column flex container, with `<div row>` and
`<div block>` as the escape hatches. This is a convention of the reset, and the
design adopts it rather than fighting it: layout `div`s are written expecting
column flow, and `gap` replaces vertical margins wherever the reset's flex
default applies.

The reset reaches the light DOM only. A shadow root inherits `font-family`,
`line-height` and `color` from the host and nothing else, so shadow roots need
their own minimal reset — including the `div` rules above, so that a `div`
behaves identically on both sides of the boundary.

## Approach

Custom properties inherit through shadow boundaries. That is the mechanism the
whole system rests on: values are declared once, in `:root`, and every component
reads them with `var(--cc-*)`. Rules are written twice — once for the light DOM
shell, once for shadow roots — but no value is.

The rejected alternatives: a single constructable `CSSStyleSheet` pushed into
`document.adoptedStyleSheets` and every `shadowRoot` (components stop describing
their own styles and Lit's `static styles` dedup is bypassed), and moving
components to the light DOM with `createRenderRoot()` (abandons encapsulation,
and is the opposite of the requirement).

### Files

```
src/styles/tokens.css    :root custom properties + dark mode
src/styles/app.css       light-DOM shell: body, header, .page, route panels
src/styles/shared.ts     Lit css` ` modules: base, controls, panel, dataTable
```

Route entry modules import the first three stylesheets, replacing the Pico line:

```ts
import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
```

Components compose the shared Lit modules:

```ts
static override styles = [base, controls, dataTable, css`/* component-local */`];
```

Lit deduplicates a shared `CSSResult` across roots, so `base` is parsed once no
matter how many components include it.

**The rule that keeps the two sides honest:** a rule in `shared.ts` or a
component's local `css` may only reference values through `var(--cc-*)`. No hex
codes, no rem literals for spacing or type. A literal in shadow CSS is the
defect this rule exists to prevent — it is what the current `cc-due-list` and
`cc-error-banner` styles do, and why nothing in the app matches anything else.

### Tokens

`tokens.css` declares one `:root` block and one `@media (prefers-color-scheme:
dark)` override of the colour tokens only. Sizes, spacing and type do not change
between themes.

| Group | Tokens |
| --- | --- |
| Type | `--cc-font-sans`, `--cc-font-mono`, `--cc-text-xs` … `--cc-text-2xl`, `--cc-leading` |
| Space | `--cc-space-1` … `--cc-space-8` |
| Shape | `--cc-radius-sm`, `--cc-radius-md`, `--cc-border-width` |
| Surface | `--cc-bg`, `--cc-surface`, `--cc-surface-sunken`, `--cc-border`, `--cc-shadow-sm` |
| Text | `--cc-text`, `--cc-text-muted`, `--cc-link` |
| Accent | `--cc-accent`, `--cc-accent-hover`, `--cc-accent-text` |
| Status | `--cc-danger`, `--cc-danger-surface`, `--cc-success`, `--cc-warning` |
| Urgency | `--cc-urgency-overdue`, `--cc-urgency-soon` |
| Focus | `--cc-focus-ring` |

`--cc-font-sans` names a Thai face ahead of the Latin system stack so that both
languages render from installed fonts with no network request:

```css
--cc-font-sans: system-ui, -apple-system, "Segoe UI", Roboto,
  "IBM Plex Sans Thai", "Noto Sans Thai", "Sarabun", sans-serif;
--cc-leading: 1.65;
```

`1.65` rather than the reset's `1.5`: Thai stacks vowel and tone marks above and
below the baseline, and 1.5 clips them in mixed EN/TH lines.

### Shared Lit modules

`base` — shadow-root reset: `box-sizing`, the reset's `div` flex convention,
`:host { display: block; color: var(--cc-text); font: inherit }`, zeroed margins
on headings and paragraphs, list-marker removal, `a { color: var(--cc-link) }`.

`controls` — `button`, `input`, `select`, `label`, `fieldset`, `legend`. Three
button variants (below), a visible `:focus-visible` ring on every focusable
element drawn from `--cc-focus-ring`, and a `:disabled` state.

`panel` — the surface used for a bordered, padded section: background, border,
radius, padding, and a `header`/`footer` treatment.

`dataTable` — table typography, header row, row separators, `tabular-nums` and
right alignment on a `[data-numeric]` cell, and the stacked-row transformation
below `640px`.

### Button variants

Pico's `secondary` and `secondary outline` classes disappear with Pico. They are
replaced by an explicit attribute, so the variant is a component API rather than
a framework leftover:

| Was | Becomes | Used by |
| --- | --- | --- |
| *(no class)* | *(no attribute)* — filled accent | submit and primary actions |
| `class="secondary"` | `data-variant="quiet"` | `cc-card-table` archive, `cc-card-form` cancel, `cc-statement-list` unmark, `cards.ts` dismiss and export, `card.ts` show-older |
| `class="secondary outline"` | `data-variant="danger"` | `cc-card-table` delete, `cc-statement-list` delete-purchase |

Two test assertions are coupled to the old names and change with them:
`src/components/cc-card-table.test.ts:35` and `:43` select
`button.secondary.outline`; both become `button[data-variant="danger"]`.

## Layout

### Shell

`app.css` owns the shell. A sticky header holds the brand on the left and the
nav links plus `<cc-lang-switch>` on the right, as a flex row that wraps to two
lines on a narrow screen. Below it, `.page` centres the content at a maximum of
`72rem` with `--cc-space-4` side padding plus `env(safe-area-inset-*)`.

The nav markup in the three route HTML files changes from Pico's two-`<ul>`
structure to that flex header. The element ids `#nav-brand`, `#nav-dashboard`
and `#nav-cards` are preserved exactly, so `src/lib/ui/chrome.ts` and its tests
are untouched.

### Dashboard (`index.html`)

At `≥960px` a two-column grid: the due list in a wide left column, quick-add in
a narrower right column that sticks below the header while the list scrolls.
Below `960px` the columns stack, quick-add first — on a phone, adding a purchase
is the reason the page is open. The location groups panel spans the full width
underneath in both cases.

### Card registry (`cards.html`)

The form panel and the backup panel sit side by side at `≥960px` and stack
below it. The card table is full width beneath them.

### Card detail (`card.html`)

A heading block (card name, masked number, location, cycle, comment) above a
list of statement panels. Each statement panel keeps its header/total structure
but gains the panel surface, right-aligned tabular amounts, and a footer total
that is visually distinct from the purchase rows.

### Tables on a phone

`cc-due-list` and `cc-card-table` render a real table at `≥640px`. Below that
each row becomes a stacked block: the card name as a heading, then label/value
pairs drawn from the column headers via `data-label` attributes on the cells,
then the row's action button. The markup is one table in both cases; only CSS
changes, so no test that reads cell text or clicks a button is affected.

### Urgency

`--cc-urgency-*` drives a left border, as it did before this branch, but colour
is no longer the only signal: an overdue or due-soon row also carries a short
text badge, so a reader who cannot distinguish the border still gets the signal
in text. The existing `due.overdue` / `due.today` / `due.inDays` messages
already supply that text per language, so the badge is a style applied to
markup that exists rather than a new string in the catalog.

## Dependencies

Remove `@picocss/pico@2.1.1`. Add `@kcstyles/reset.css@1.0.12`.

## Testing and verification

`bun test` covers structure and behaviour, not appearance — happy-dom does not
compute styles, so no test asserts a colour or a width, and none should be added
to. The suite must stay green through the change; the only test edit in scope is
the two `button.secondary.outline` selectors named above.

Appearance is verified by running the app and looking at it: `bun run dev`, then
Playwright screenshots of all three pages at `390px` and `1280px`, in both
English and Thai, in light and dark. The Thai pass is not optional — the line
height, the font stack and the wider nav labels are the reasons Thai is the
language most likely to break the layout.

`bun run typecheck` and `bun run check` (Biome) must both pass.

## Risks

**Everything is unstyled until the system exists.** Deleting the Pico import
before `app.css` is complete leaves the app visibly broken. The implementation
plan must land `tokens.css` and `app.css` in the same step that removes Pico,
not before it.

**Shadow CSS drifting from tokens.** The one rule that prevents this — no
literal values in shadow CSS — is not machine-checked. It is a review point, and
the two components that currently violate it (`cc-due-list`,
`cc-error-banner`) are rewritten rather than extended.
