---
name: project-components
description: Use when writing, editing or moving a component in src/components/ (atoms, molecules, organisms), deciding which atomic tier a component belongs to, deciding between static markup and a Svelte island, rendering the reader's data in the browser, styling with the cc tokens, writing a component test, or debugging a component that renders nothing, loses its styles or ships no JavaScript.
---

# Components

Layouts are the `project-layouts` skill; routes are the `project-pages` skill.

## Astro and Svelte

Every component is an `.astro` file in an atomic tier, or a `.svelte` island when the browser
must render it (see below). The Lit components these replaced were removed (PRD DD-185).

## Atomic tiers

Every component is `src/components/<tier>/<PascalName>.astro`, and its tier limits what it
imports:

| Tier | Directory | Holds | May import |
|---|---|---|---|
| Atoms | `atoms/` | one element: button, chip, icon, money amount, input | no component |
| Molecules | `molecules/` | a few atoms acting as one unit: search box + filter button, a card tile | atoms |
| Organisms | `organisms/` | a page section: site header, tab bar, *Needs you*, the ledger | atoms, molecules, organisms |

Atomic *templates* are `src/layouts/` and *pages* are `src/pages/`; both may import any tier.
`tests/components/atomic.test.ts` (rules in `tests/components/atomic.ts`) fails on an
`.astro` component outside a tier, or on an import its tier does not allow — a molecule
importing a molecule included.

- Pick the lowest tier that fits. An atom that needs another component is a molecule; a
  molecule that needs another molecule is an organism. Move it up instead of loosening the
  rule.
- Moving a component between tiers moves its test (`tests/components/<tier>/`) and every
  import of it.
- Import with the alias, tier and extension: `import Chip from "#components/atoms/Chip.astro"`.
- `src/components/` may import from `src/lib/` and `src/styles/`, never from `src/layouts/`,
  `src/pages/`.

## Static first, Svelte for what the browser renders (PRD DD-172)

The frontmatter runs **once, at build time**. Nothing the reader owns exists then: every
card, purchase and payment is in the browser's `localStorage` (PRD DD-03), and the locale is
read in the browser too. Choose the lightest thing that works, in this order:

1. **Static `.astro`** — anything the same for every reader: structure, headings, labels,
   links, empty states that need no data. Ships no JavaScript. Prefer it: a section that only
   *looks* dynamic often splits into a static frame plus a small island.
2. **A Svelte island** — anything built from the reader's data or that reacts to input: a
   list of cards, a form, a sheet, a filter. A `.svelte` component in the same atomic tier,
   placed in an `.astro` parent with a hydration directive (`client:load` for what is on
   screen at once, `client:visible` for what is further down). Its build-time render is the
   empty frame; it reads the repository in the browser only (`onMount` or an `$effect`),
   never in the component's top-level code, which also runs at build time.
3. **A raw `<script>`** — only for page plumbing with no UI of its own, such as the inline
   theme boot and the GTM loader in `BaseLayout`. Never to build or update markup.

Keep an island small: the static parts stay in the `.astro` parent and only the part that
changes is Svelte. Props passed to an island are serialized into the page, so pass plain
values (ids, flags, labels), not repositories or functions. Put the logic in `src/lib/` as
plain functions taking their inputs (a repository, a clock), so it is tested without
rendering; the island wires those functions to its state.

Navigation swaps pages without a reload (PRD DD-174). An island on one page is torn down with
it, so it cleans up in `onMount`'s return (as `HeaderDate` returns its `subscribe`'s
remover). An island in the shell that should outlive navigation takes `transition:persist`
(`<HeaderDate client:load transition:persist />`), so it isn't hydrated afresh on every page.

Svelte 5 (runes) comes through `@astrojs/svelte` in `astro.config.ts`. The first island is
`src/components/atoms/HeaderDate.svelte`: `$props()` with a `clock` for tests, `$state` for
what it shows, `onMount` to read the browser and `subscribe` to follow the locale. A `.svelte`
component sits in an atomic tier like any other; the tier test reads its `<script>` imports.

An island that reads the reader's data follows `LocationsEditor.svelte` (PRD DD-175):

- It opens the store in `onMount` through an `open` prop defaulting to `openRepository()`
  (`#lib/ui/startup`); tests pass `open: async () => ({ ok: true, repo })` over an
  `InMemoryRepository`. When the store won't open it shows `opened.message()` in an
  `ErrorBanner` with Reload, and nothing else.
- `createPageState` (`#lib/ui/page-state`) runs its load and guarded writes; its `paint` bumps a `$state` counter that the banner's `$derived` message reads.
- `t()` isn't reactive: keep `let lang = $state(getLocale())`, updated from `subscribe` in
  `onMount`, and read it in a small helper (`tr(key)`, `why(problem)`) so every translated
  string follows a switch. Return `subscribe`'s remover (and clear any timer or listener)
  from `onMount`.
- Rune state shared between components lives in a `*.svelte.ts` module under `src/lib/ui/`,
  imported without the `.ts` (`#lib/ui/open-row.svelte`, `#lib/ui/two-step.svelte`).
- Shared pieces so far: `ErrorBanner.svelte` (molecule; light DOM, drawn by `.error-banner`
  in app.css; leave out `onretry` inside a sheet), `Sheet.svelte` (molecule; the bottom sheet, `leave(then)` to slide
  it away first), `SvgIcon.svelte` (atom; the `Icon` atom for islands, since a `.svelte` file
  can't import an `.astro` one), and `#lib/ui/address-bar` (the `AddressBar` seam for a
  page whose sheet lives in the address, DD-102), `SubHeaderBar.svelte` (molecule; the
  sub-header with a title from the reader's data, a `detail` line and an `actions` snippet),
  and `#lib/ui/card-label` (a
  card's name in its text forms; never copy it), and `ActionRow.svelte` (molecule; the row that
  opens in place, with `TwoStepButtons` for a two-step _Delete_ or _Confirm_; with `onopen` and
  `current` the same row opens its record in the detail panel instead, as a list's row does on
  the Lists tab).
- The detail panel (PRD RD-23, DD-196) is three pieces; never build another. `RecordPanel`
  (`#lib/ui/record-panel.svelte`) is the open record in the address (`card`, `limit`, `list`)
  and every step through history: the page makes one over its `AddressBar` (`path`, `kinds`),
  calls `start()` in `onMount`, writes its own address through `panel.keep(url)`, and calls
  `show(ref)` from a list, `deeper(ref)` from inside a panel, `openForm`, `blank(kind)`, `back`,
  `close`, `created(ref)`. `DetailPanel.svelte` (molecule) draws the column or sheet and its
  head; the page wraps its list and the panel in `.panel-layout` (`data-panel` while open,
  app.css). A kind's content is an organism that reads the store itself, as `CardPanel.svelte`,
  `LimitPanel.svelte` and `ListPanel.svelte` do, so any page can hold it. `PurchaseForm.svelte` and
  `GroupForm.svelte` are the purchase and group forms without a sheet.
- A page with tabs (PRD RD-22) heads its `main` slot with `PageTabs.astro` (molecule, static):
  one bar on one rule, the title (`--cc-text-xl`), an `aria-hidden` divider, then one link per tab,
  each tab its own page, the one on show marked `aria-current="page"` and underlined on the bar's
  rule; only the links scroll sideways (never wrapping), on every width (`<PageTabs
  title="cards.title" label="cards.tabs" tabs={CARDS_TABS} current="/cards" />`). A tab list is a
  `PageTab[]` in `#lib/ui/page-tabs` (`CARDS_TABS`, `TRANSACTIONS_TABS`, `HOME_TABS`). A tab listing
  cards (Cards, Home's _Owed_ and _Ready to use_) heads its list with `FilterControls` and opens
  `CardListFilter.svelte` (organism: Cards' _Filter · Sort · Group_ sheet, its `filters` snippet for
  a list's own sections), and draws its results with `CardSections.svelte` (molecule: Cards'
  sections or flat grid of tiles). Never draw a sort control of its own. A tile that needs a button
  (_Pay_ on an owed tile) passes it as `CardTile`'s `action` snippet, drawn beside the tile's link,
  never inside it. A tab's add button goes at the end of its search row, through `FilterControls`'
  `end` snippet, as a quiet `button.tx-fbtn` (_+ Add card_, _+ Add limit_), or an `a.btn.tx-fbtn`
  when it leads to a page (_+ Add list_).
- An island's top-level code also runs at build time, where there is no `location`,
  `history` or `localStorage`: read them in `onMount`, or through a seam that has a
  build-time answer (`browserBar().search()` is `""` there). `bun run build` fails on it.

Before reaching for an island, check whether the platform already does it with no script:
an HTML `popover` (as the retired *+ New* menu was, PRD DD-173) is opened and closed by the
browser, on Escape and a tap outside, which hands focus back. `@kcstyles/reset.css` makes
every `div` `display: flex`, which outranks the browser's hiding of a closed popover, so a
popover `div` needs `:not(:popover-open) { display: none }` of its own.

### Translated copy (PRD DD-171)

Every string is a catalog key with an entry in both `src/lib/i18n/en.ts` and `th.ts`. The
reader's locale is only known in the browser, so:

- **Static copy** in `.astro` markup is the English text plus its key:
  `<h2 data-i18n="nav.cards">Cards</h2>`. `startCopy` (`#lib/i18n/copy`), run by
  `BaseLayout` on every page, swaps every `[data-i18n]` element's text to the reader's
  locale and again whenever it changes. Never hardcode copy without its `data-i18n` key.
  - The key replaces the element's whole text, so put it on the innermost element holding
    only that copy (`<span data-i18n="…">`), never on one with child elements or data.
  - A translated name goes the same way: `aria-label="Pages" data-i18n-aria-label="nav.pages"`.
  - Write the English from the catalog (`{en["nav.cards"]}`), not by hand, so the markup and
    the key can't drift apart.
  - `tests/lib/i18n/markup-keys.test.ts` fails on a key missing from `en.ts` or `th.ts`; at
    runtime an unknown key leaves the English.
  - Thai copy stays hidden (`visibility: hidden`, so the layout doesn't shift) until the pass
    has run: the boot script sets `<html lang>` before first paint and `startCopy` marks
    `<html data-i18n-ready>`.
- **Copy inside a Svelte island** comes from `t()`, re-read when the locale changes
  (`subscribe` from `#lib/i18n/index`), like the data it sits beside. Its built frame is English
  (with no reader, `getLocale()` answers English at build time), and on a Thai page
  `html[lang="th"] astro-island[ssr]` keeps it hidden until the island runs and Astro drops
  `ssr`; `tests/lib/i18n/build-locale.test.ts` holds both.

## Styles and the design system

`AGENTS.md`'s design-system rules hold for every `.astro` and `.svelte` component:

- Every value comes from `src/styles/tokens.css`, read only through `var(--cc-*)`: no
  literal hex, `rem`/`px` or colour in a component `<style>`.
- Buttons take `data-variant="quiet"` or `data-variant="danger"`; none means primary.
- Never key a selector off translated text; use classes or locale-invariant attributes.
- A list is a row list or a card list, never a third look; a row that opens in place has one
  `<button>` head with `aria-expanded`/`aria-controls`.

A component `<style>` is **scoped** (Astro adds `data-astro-cid-*`), so it misses markup a
child component or slot renders; use `:global(…)` deliberately. The global sheets
(`@kcstyles/reset.css`, `tokens.css`, `app.css`) come from `BaseLayout`.

`@kcstyles/reset.css` makes every bare `div` a flex column: `<div row>` for a row,
`<div block>` for block. `src/env.d.ts` types both. A `div` that wants a row must say so even
after `display: flex` — not a redundancy to delete.

## Shape of a component

```astro
---
interface Props {
	label: string
	variant?: "quiet" | "danger"
}

const { label, variant } = Astro.props
---

<button type="button" data-variant={variant}>{label}</button>

<style>
	button {
		padding: var(--cc-space-2) var(--cc-space-3);
	}
</style>
```

- Props are an `interface Props`; `astro check` enforces them at every call site. Optional
  props get their default in the destructuring.
- Children go through `<slot />` and named slots.

## Testing

Tests live in `tests/`, mirroring `src/` (`src/components/atoms/Chip.astro` →
`tests/components/atoms/Chip.test.ts`). Render with the Container API, under the node
environment — happy-dom's globals make Astro's renderer mistake a component for a framework
one:

```ts
// @vitest-environment node
import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, test } from "vitest"

import Chip from "#components/atoms/Chip.astro"

test("renders the label", async () => {
	const container = await AstroContainer.create()
	const html = await container.renderToString(Chip, { props: { label: "Krabi" } })
	expect(html).toMatch(/<span[^>]*>Krabi<\/span>/)
})
```

- Match `<span[^>]*>`, not `<span>`: scoped styles add `data-astro-cid-*`.
- Slots go in `{ slots: { default: "<b>child</b>" } }`.
- Anything that renders an island through the Container needs the Svelte renderer: use
  `createContainer()` from `tests/container.ts` (with `parseHtml` to query the result) under
  `// @vitest-environment node`. That proves the build-time frame
  (`tests/components/atoms/HeaderDate.server.test.ts`).
- What the island does in the browser is tested by mounting it in happy-dom (the default
  environment): `mount` and `flushSync` from `svelte` (`HeaderDate.test.ts`).
  `vitest.config.ts` resolves the `browser` condition so `mount` gets Svelte's client build;
  node-environment files still render on the server. Svelte 5 listens for `click`, `input`,
  `change` and `submit` once at its root, so a test must dispatch them as a browser does —
  `new Event("change", { bubbles: true })` — or the handler never runs.
- Logic worth testing on its own goes in `src/lib/` and `tests/lib/`; `tests/setup.ts` clears
  `localStorage` and the locale before every test.
- No test renders colour, spacing or layout; list those as preview checks in the PR and
  screenshot at 390 and 1280px, light and dark, English and Thai.
