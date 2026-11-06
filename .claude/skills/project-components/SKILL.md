---
name: project-components
description: Use when writing, editing or moving a component in src/components/ (atoms, molecules, organisms), converting a Lit component to Astro, deciding which atomic tier a component belongs to, adding client-side script, styling with the cc tokens, writing a component test, or debugging a component that renders nothing, loses its styles or ships no JavaScript.
---

# Components

Layouts are the `project-layouts` skill; routes are the `project-pages` skill.

## Astro now, Lit is legacy

cc-tracking is moving from Lit to Astro (PRD DD-170). Every **new** component is an `.astro`
file in an atomic tier. The Lit components (`src/components/cc-*.ts`, `action-row.ts`,
`card-tile.ts` and the rest) are legacy: don't add one, and don't grow one when the change
can be the conversion instead. Converting one means writing its Astro replacement in a tier,
moving its callers over, and deleting the Lit file and its test in the same change.

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
  (`#components/<tier>/*` maps the path as written; the bare `#components/*` still adds
  `.ts` for the Lit legacy.)
- `src/components/` may import from `src/lib/` and `src/styles/`, never from `src/layouts/`
  or `src/pages/`.

## Build time and the browser

The frontmatter runs **once, at build time**. Nothing the reader owns exists then: every
card, purchase and payment is in the browser's `localStorage` (PRD DD-03), and the locale is
read in the browser too. So a component splits in two:

- **The `.astro` markup** is what is the same for every reader: structure, empty states that
  need no data, `id`s and `data-*` hooks.
- **A `<script>`** in the component reads the repository and fills the markup in the browser.
  Astro bundles it (TypeScript and `#lib/*` imports work), dedupes it across instances and
  ships it as a module. Frontmatter values don't reach it: pass them through `data-*`
  attributes, read with `dataset["name"]` (`noPropertyAccessFromIndexSignature`).

Put the script's logic in `src/lib/` as plain functions taking their inputs (a repository,
an element, a clock), and keep the `<script>` itself a few lines of wiring. The Container API
does not run scripts, so logic left inside one is untested.

**Open question, settle with the user before converting a component that shows text:** how
build-time markup gets translated copy. Today every string is a catalog key rendered by Lit
in the browser (`t()` from `#lib/i18n/index`, entries in both `en.ts` and `th.ts`). Until it
is decided, don't hardcode English in `.astro` markup.

## Styles and the design system

`AGENTS.md`'s design-system rules hold for Astro exactly as for Lit:

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
- Script logic is tested in `tests/lib/` against happy-dom (the default environment, with
  `tests/setup.ts` clearing `localStorage` and the locale before every test).
- No test renders colour, spacing or layout; list those as preview checks in the PR and
  screenshot at 390 and 1280px, light and dark, English and Thai.
