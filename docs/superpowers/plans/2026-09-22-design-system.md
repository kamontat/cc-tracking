# Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@picocss/pico` with `@kcstyles/reset.css` plus a token-driven design system that styles the light DOM and every shadow root from one set of values, and rework the layout of all three pages around it.

**Architecture:** Values live once, in `:root` custom properties (`src/styles/tokens.css`), which inherit through shadow boundaries. The light-DOM shell reads them from `src/styles/app.css`; shadow roots read them from shared Lit `css` modules in `src/styles/shared.ts`, composed into each component's `static styles`. Rules are written twice, once per DOM; no value is.

**Tech Stack:** Bun, Lit 3.3.3, `@kcstyles/reset.css` 1.0.12, TypeScript, Biome, happy-dom + `bun test`.

**Spec:** `docs/superpowers/specs/2026-09-22-design-system-design.md`

## Global Constraints

- **No literal values in shadow CSS.** Every rule in `src/styles/shared.ts` and in a component's local `css` block references values only through `var(--cc-*)`. No hex codes, no `rem`/`px` literals for spacing, type size, or radius. Border hairlines use `var(--cc-border-width)`.
- **Dependency change, exact versions:** remove `@picocss/pico@2.1.1`, add `@kcstyles/reset.css@1.0.12`. `bunfig.toml` sets `install.exact = true`, so `bun add` pins without a range.
- **The reset is light-DOM only and opinionated.** It ends with `div { display: flex; flex-direction: column }`, `div[row=""] { flex-direction: row }`, `div[block=""] { display: block }`. Adopt this convention; mirror it into the shadow `base` module so a `div` behaves identically on both sides of the boundary.
- **Thai line height is 1.65, not 1.5.** Thai stacks vowel and tone marks above and below the baseline and clips at 1.5. `--cc-leading: 1.65` applies to both languages.
- **No web fonts.** `--cc-font-sans` names installed faces only, Thai first among the fallbacks.
- **Breakpoints:** `640px` (tables stop stacking) and `960px` (page layouts go two-column). Nothing else.
- **No new unit tests for appearance.** happy-dom does not compute styles. Tests assert markup contracts only — attributes, element presence, text. Appearance is verified visually in Task 9.
- **Every task ends green:** `bun test`, `bun run typecheck`, and `bun run check` all pass before the commit.
- **Formatting:** run `bun run format` before committing; Biome owns indentation (tabs) and quoting.
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Tokens, page shell, and Pico removal

The spec's stated risk: deleting the Pico import before `app.css` exists leaves the app visibly broken. Both halves land in this one task.

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/app.css`
- Modify: `src/routes/index.ts:1`, `src/routes/cards.ts:1`, `src/routes/card.ts:1`
- Modify: `src/routes/index.html:8-18`, `src/routes/cards.html:8-18`, `src/routes/card.html:8-18`
- Modify: `package.json` (dependencies)
- Test: none new — `src/lib/ui/chrome.test.ts` and `src/lib/ui/page.test.ts` must keep passing unchanged, which is what proves the nav rewrite preserved the element ids.

**Interfaces:**
- Consumes: nothing.
- Produces: the `--cc-*` token vocabulary that every later task reads; the light-DOM class names `.site-header`, `.site-header__brand`, `.site-header__nav`, `.page`; the preserved element ids `#nav-brand`, `#nav-dashboard`, `#nav-cards`, `#page`.

- [ ] **Step 1: Swap the dependency**

```bash
bun remove @picocss/pico
bun add @kcstyles/reset.css@1.0.12
```

- [ ] **Step 2: Create `src/styles/tokens.css`**

```css
:root {
	color-scheme: light dark;

	--cc-font-sans: system-ui, -apple-system, "Segoe UI", Roboto,
		"IBM Plex Sans Thai", "Noto Sans Thai", "Sarabun", sans-serif;
	--cc-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
	--cc-leading: 1.65;

	--cc-text-xs: 0.75rem;
	--cc-text-sm: 0.8125rem;
	--cc-text-md: 0.9375rem;
	--cc-text-lg: 1.125rem;
	--cc-text-xl: 1.375rem;
	--cc-text-2xl: 1.75rem;

	--cc-space-1: 0.25rem;
	--cc-space-2: 0.5rem;
	--cc-space-3: 0.75rem;
	--cc-space-4: 1rem;
	--cc-space-5: 1.5rem;
	--cc-space-6: 2rem;
	--cc-space-7: 3rem;
	--cc-space-8: 4rem;

	--cc-radius-sm: 4px;
	--cc-radius-md: 8px;
	--cc-border-width: 1px;

	--cc-bg: #f6f7f9;
	--cc-surface: #ffffff;
	--cc-surface-sunken: #eef0f3;
	--cc-border: #d6dae0;
	--cc-shadow-sm: 0 1px 2px rgb(16 24 40 / 0.06);

	--cc-text: #1b1f24;
	--cc-text-muted: #5b6472;
	--cc-link: #0b5cd5;

	--cc-accent: #0b5cd5;
	--cc-accent-hover: #0847a6;
	--cc-accent-text: #ffffff;

	--cc-danger: #b3261e;
	--cc-danger-surface: #fdeceb;
	--cc-success: #1b7f4b;
	--cc-warning: #b26a00;

	/* Resolved at use, so the dark block below re-points these for free. */
	--cc-urgency-overdue: var(--cc-danger);
	--cc-urgency-soon: var(--cc-warning);
	--cc-urgency-open: var(--cc-border);

	--cc-focus-ring: 0 0 0 3px rgb(11 92 213 / 0.35);
}

@media (prefers-color-scheme: dark) {
	:root {
		--cc-bg: #14171c;
		--cc-surface: #1b1f26;
		--cc-surface-sunken: #23272f;
		--cc-border: #333a44;
		--cc-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.4);

		--cc-text: #e7eaee;
		--cc-text-muted: #a2acba;
		--cc-link: #7fb0ff;

		--cc-accent: #3b82f6;
		--cc-accent-hover: #5b9bff;
		--cc-accent-text: #0b1220;

		--cc-danger: #f2837c;
		--cc-danger-surface: #3a1d1b;
		--cc-success: #5bc98d;
		--cc-warning: #e0a458;

		--cc-focus-ring: 0 0 0 3px rgb(59 130 246 / 0.45);
	}
}
```

- [ ] **Step 3: Create `src/styles/app.css`**

This file styles the light DOM only: the shell, and the `<h1>`/`<h2>`/`<article>` elements the route templates render into `#page`. Route-specific layout classes arrive in Task 8.

```css
html {
	font-family: var(--cc-font-sans);
	line-height: var(--cc-leading);
}

body {
	min-height: 100dvh;
	background: var(--cc-bg);
	color: var(--cc-text);
	font-size: var(--cc-text-md);
}

a {
	color: var(--cc-link);
}

a:hover {
	text-decoration: underline;
}

:focus-visible {
	outline: none;
	box-shadow: var(--cc-focus-ring);
}

.site-header {
	position: sticky;
	top: 0;
	z-index: 10;
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--cc-space-3);
	padding: var(--cc-space-3) var(--cc-space-4);
	padding-top: calc(var(--cc-space-3) + env(safe-area-inset-top, 0px));
	background: var(--cc-surface);
	border-bottom: var(--cc-border-width) solid var(--cc-border);
}

.site-header__brand {
	margin-inline-end: auto;
	font-size: var(--cc-text-lg);
	font-weight: 600;
}

.site-header__nav {
	display: flex;
	flex-direction: row;
	align-items: center;
	gap: var(--cc-space-4);
}

.site-header__nav a {
	color: var(--cc-text-muted);
	font-weight: 500;
}

.site-header__nav a:hover {
	color: var(--cc-text);
}

.page {
	display: flex;
	flex-direction: column;
	gap: var(--cc-space-5);
	width: 100%;
	max-width: 72rem;
	margin-inline: auto;
	padding: var(--cc-space-5) max(var(--cc-space-4), env(safe-area-inset-left, 0px))
		calc(var(--cc-space-7) + env(safe-area-inset-bottom, 0px));
}

.page h1 {
	font-size: var(--cc-text-2xl);
	font-weight: 650;
	letter-spacing: -0.01em;
}

.page h1 small {
	font-size: var(--cc-text-lg);
	font-weight: 400;
	color: var(--cc-text-muted);
}

.page h2 {
	font-size: var(--cc-text-lg);
	font-weight: 600;
}

.page > article {
	display: flex;
	flex-direction: column;
	gap: var(--cc-space-3);
	padding: var(--cc-space-4);
	background: var(--cc-surface);
	border: var(--cc-border-width) solid var(--cc-border);
	border-radius: var(--cc-radius-md);
	box-shadow: var(--cc-shadow-sm);
}

.page button {
	align-self: flex-start;
	padding: var(--cc-space-2) var(--cc-space-3);
	font: inherit;
	font-weight: 550;
	line-height: 1.2;
	color: var(--cc-accent-text);
	background: var(--cc-accent);
	border: var(--cc-border-width) solid transparent;
	border-radius: var(--cc-radius-sm);
}

.page button:hover {
	background: var(--cc-accent-hover);
}

.page button[data-variant="quiet"] {
	color: var(--cc-text);
	background: var(--cc-surface-sunken);
	border-color: var(--cc-border);
}

.page button[data-variant="quiet"]:hover {
	background: var(--cc-border);
}

.page label {
	display: flex;
	flex-direction: column;
	gap: var(--cc-space-1);
	font-size: var(--cc-text-sm);
	color: var(--cc-text-muted);
}

.page input {
	padding: var(--cc-space-2);
	font: inherit;
	font-size: var(--cc-text-md);
	color: var(--cc-text);
	background: var(--cc-surface);
	border: var(--cc-border-width) solid var(--cc-border);
	border-radius: var(--cc-radius-sm);
}

.page small {
	font-size: var(--cc-text-sm);
	color: var(--cc-text-muted);
}
```

- [ ] **Step 4: Swap the stylesheet imports in all three route modules**

In `src/routes/index.ts`, `src/routes/cards.ts` and `src/routes/card.ts`, replace line 1:

```ts
import "@picocss/pico/css/pico.min.css";
```

with:

```ts
import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
```

The order matters: the reset first, then tokens, then the shell that reads them.

- [ ] **Step 5: Rewrite the nav in all three HTML files**

`src/routes/index.html`, `src/routes/cards.html` and `src/routes/card.html` share the same `<body>`. Replace the `<nav class="container">…</nav>` and `<main class="container" id="page">` block in each with:

```html
<body>
  <header class="site-header">
    <strong class="site-header__brand" id="nav-brand">cc-tracking</strong>
    <nav class="site-header__nav">
      <a href="/" id="nav-dashboard">Dashboard</a>
      <a href="/cards" id="nav-cards">Cards</a>
      <cc-lang-switch></cc-lang-switch>
    </nav>
  </header>
  <main class="page" id="page"></main>
</body>
```

The ids `nav-brand`, `nav-dashboard`, `nav-cards` and `page` are load-bearing: `src/lib/ui/chrome.ts` fills the first three by id, and every route resolves `#page`. `src/lib/ui/page.ts:46` falls back to `document.querySelector("main")`, which the `<main>` element above still satisfies. Leave the `<head>` of each file alone.

- [ ] **Step 6: Verify the suite is still green**

Run: `bun test`
Expected: PASS, same count as before the task. `chrome.test.ts` and `page.test.ts` pass untouched, which is the proof that the nav rewrite kept the ids.

Run: `bun run typecheck && bun run check`
Expected: both clean.

- [ ] **Step 7: Look at the result once**

Run: `bun run dev`, open `/`, and confirm the header is a single row with the brand left and the links plus language picker right, the page body is centred, and no Pico artifact remains. Components below will still look unstyled — that is expected until Task 2 onward.

- [ ] **Step 8: Commit**

```bash
bun run format
git add package.json bun.lock src/styles src/routes
git commit -m "$(cat <<'EOF'
feat: replace picocss with a token-driven page shell

Pico only ever styled the light DOM, and its variables never crossed a
shadow boundary. The replacement splits that job in two: tokens.css
declares every value once on :root, where custom properties do cross the
boundary, and app.css styles the shell that the route templates render
into.

The nav moves from Pico's twin-<ul> structure to a flex header. The
element ids stay exactly as they were, so chrome.ts and its tests are
untouched -- their still passing is what proves it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Shared shadow styles, proven on `cc-error-banner`

**Files:**
- Create: `src/styles/shared.ts`
- Modify: `src/components/cc-error-banner.ts:1-16` (the `styles` block), `:32` (the `<article>` markup)
- Test: `src/components/cc-error-banner.test.ts` (one new test)

**Interfaces:**
- Consumes: the `--cc-*` tokens from Task 1.
- Produces: four `CSSResult` exports from `src/styles/shared.ts` — `base`, `controls`, `panel`, `dataTable` — imported by every component task that follows as `#styles/shared`, the subpath this task registers.

- [ ] **Step 1: Register the `#styles/*` subpath import**

In `package.json`, add to the existing `imports` block so component files reference styles the same way they reference `#lib/*`:

```json
"imports": {
	"#lib/*": "./src/lib/*.ts",
	"#components/*": "./src/components/*.ts",
	"#styles/*": "./src/styles/*.ts"
}
```

- [ ] **Step 2: Write the failing test**

Append to `src/components/cc-error-banner.test.ts`. It asserts the markup contract the new styles hang off — the banner's retry button is the quiet variant, and the alert carries a status attribute the CSS can select:

```ts
test("marks the banner as an error surface and its retry as a quiet button", async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-error-banner");
	element.message = "Could not save the card.";
	document.body.append(element);
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector('article[data-tone="danger"]'),
	).not.toBeNull();
	expect(
		element.shadowRoot?.querySelector('button[data-variant="quiet"]'),
	).not.toBeNull();
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test src/components/cc-error-banner.test.ts`
Expected: FAIL — the new test's two `expect(...).not.toBeNull()` assertions receive `null`, because the current markup has neither attribute.

- [ ] **Step 4: Create `src/styles/shared.ts`**

```ts
import { css } from "lit";

/**
 * The shadow-root counterpart to the document reset. `@kcstyles/reset.css` is a
 * document stylesheet, so none of it reaches a shadow root -- only inherited
 * properties do. This re-states the parts a component actually depends on,
 * including the reset's own `div`-as-column-flex convention, so that markup
 * behaves the same on both sides of the boundary.
 */
export const base = css`
	:host {
		display: block;
		font-family: var(--cc-font-sans);
		font-size: var(--cc-text-md);
		line-height: var(--cc-leading);
		color: var(--cc-text);
	}

	*,
	*::before,
	*::after {
		box-sizing: border-box;
	}

	div {
		display: flex;
		flex-direction: column;
	}

	div[row] {
		flex-direction: row;
	}

	div[block] {
		display: block;
	}

	h1,
	h2,
	h3,
	h4,
	p {
		margin: 0;
		font-size: inherit;
		font-weight: inherit;
	}

	ul,
	ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	a {
		color: var(--cc-link);
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	small {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	[hidden] {
		display: none !important;
	}
`;

/** Buttons, inputs and labels. Three button variants, keyed off `data-variant`. */
export const controls = css`
	button {
		align-self: flex-start;
		padding: var(--cc-space-2) var(--cc-space-3);
		font: inherit;
		font-size: var(--cc-text-sm);
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		color: var(--cc-accent-text);
		cursor: pointer;
		background: var(--cc-accent);
		border: var(--cc-border-width) solid transparent;
		border-radius: var(--cc-radius-sm);
	}

	button:hover {
		background: var(--cc-accent-hover);
	}

	button[data-variant="quiet"] {
		color: var(--cc-text);
		background: var(--cc-surface-sunken);
		border-color: var(--cc-border);
	}

	button[data-variant="quiet"]:hover {
		background: var(--cc-border);
	}

	button[data-variant="danger"] {
		color: var(--cc-danger);
		background: transparent;
		border-color: var(--cc-danger);
	}

	button[data-variant="danger"]:hover {
		background: var(--cc-danger-surface);
	}

	button:disabled {
		cursor: default;
		opacity: 0.55;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	/* A radio or checkbox sits beside its text, not above it. */
	label:has(input[type="radio"]),
	label:has(input[type="checkbox"]) {
		flex-direction: row;
		align-items: center;
		gap: var(--cc-space-2);
		color: var(--cc-text);
	}

	input,
	select {
		width: 100%;
		padding: var(--cc-space-2);
		font: inherit;
		font-size: var(--cc-text-md);
		color: var(--cc-text);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-sm);
	}

	input[type="radio"],
	input[type="checkbox"] {
		width: auto;
	}

	fieldset {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-2);
		padding: var(--cc-space-3);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-sm);
	}

	legend {
		padding-inline: var(--cc-space-1);
		font-size: var(--cc-text-xs);
		font-weight: 600;
		color: var(--cc-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	:focus-visible {
		outline: none;
		box-shadow: var(--cc-focus-ring);
	}
`;

/** A bordered, padded surface. `data-tone="danger"` tints it for error states. */
export const panel = css`
	article {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
		padding: var(--cc-space-4);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	article[data-tone="danger"] {
		background: var(--cc-danger-surface);
		border-color: var(--cc-danger);
		border-left-width: var(--cc-space-1);
	}

	article > header {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--cc-space-2);
		align-items: baseline;
		justify-content: space-between;
	}

	article > footer {
		padding-top: var(--cc-space-2);
		border-top: var(--cc-border-width) solid var(--cc-border);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
`;

/**
 * Table typography, plus the stacked-row transformation below 640px. A cell
 * carrying `data-label` prints that label beside its value once stacked, which
 * is how the header row survives `thead` being hidden.
 */
export const dataTable = css`
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--cc-text-sm);
	}

	th {
		padding: var(--cc-space-2);
		font-size: var(--cc-text-xs);
		font-weight: 600;
		color: var(--cc-text-muted);
		text-align: left;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border-bottom: var(--cc-border-width) solid var(--cc-border);
	}

	td {
		padding: var(--cc-space-3) var(--cc-space-2);
		vertical-align: top;
		border-bottom: var(--cc-border-width) solid var(--cc-border);
	}

	th[data-numeric],
	td[data-numeric] {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 639px) {
		thead {
			display: none;
		}

		tr {
			display: flex;
			flex-direction: column;
			gap: var(--cc-space-2);
			padding: var(--cc-space-3) 0;
			border-bottom: var(--cc-border-width) solid var(--cc-border);
		}

		td {
			display: flex;
			flex-direction: row;
			gap: var(--cc-space-3);
			align-items: baseline;
			justify-content: space-between;
			padding: 0;
			border: 0;
		}

		td[data-label]::before {
			content: attr(data-label);
			flex: none;
			font-size: var(--cc-text-xs);
			color: var(--cc-text-muted);
			text-transform: uppercase;
			letter-spacing: 0.04em;
		}
	}
`;
```

- [ ] **Step 5: Rewrite `cc-error-banner` on top of it**

Replace the import line, the `styles` block, and the `<article>` element in `src/components/cc-error-banner.ts`. The old rules are deleted, not extended — they are the literal-value violation the global constraint exists to prevent.

```ts
import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import { t } from "#lib/i18n/index";
import { base, controls, panel } from "#styles/shared";

@customElement("cc-error-banner")
export class CcErrorBanner extends LitElement {
	static override styles = [base, controls, panel];
```

and in `render()`:

```ts
		return html`
			<article role="alert" data-tone="danger">
				<p>${this.message}</p>
				<button data-variant="quiet" @click=${() => this.dispatchEvent(new CustomEvent("retry"))}>
					${this.retryLabel || t("common.retry")}
				</button>
			</article>
		`;
```

Leave the `message` and `retryLabel` properties, the `LocaleController` in the constructor, and the `if (!this.message) return nothing` guard exactly as they are.

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun test src/components/cc-error-banner.test.ts`
Expected: PASS, all six tests. The pre-existing test at `:32` asserting `querySelector("article")` is `null` for an empty message still passes — the guard is untouched.

- [ ] **Step 7: Run the whole suite and the checks**

Run: `bun test && bun run typecheck && bun run check`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
bun run format
git add package.json src/styles/shared.ts src/components/cc-error-banner.ts src/components/cc-error-banner.test.ts
git commit -m "$(cat <<'EOF'
feat: add the shared shadow styles and put the banner on them

A shadow root inherits font, colour and line-height from its host and
nothing else, so the document reset never reaches it. shared.ts re-states
what a component depends on -- including the reset's div-as-column-flex
convention -- and adds buttons, inputs, panels and tables on top, reading
every value through var(--cc-*).

cc-error-banner is rewritten rather than extended: its old rules hardcoded
hex fallbacks for Pico variables that never resolved.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `cc-lang-switch` and `cc-location-groups`

Two components with no styles at all today. Neither carries a table or a form, so both are pure additions of `static styles` plus small markup hooks.

**Files:**
- Modify: `src/components/cc-lang-switch.ts:1-14` and `:22-32`
- Modify: `src/components/cc-location-groups.ts:1-17` and `:34-61`
- Test: `src/components/cc-location-groups.test.ts` (one new test)

**Interfaces:**
- Consumes: `base`, `controls` from `#styles/shared` (Task 2).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `src/components/cc-location-groups.test.ts`, reusing the file's existing `card`, `rowsFor` and `mount` helpers:

```ts
test("gives each group a heading and a card list the styles can select", async () => {
	const element = await mount(rowsFor(card("a", "krabi")));

	expect(element.shadowRoot?.querySelector("details > summary")).not.toBeNull();
	expect(
		element.shadowRoot?.querySelector("article[data-group] > h3"),
	).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/cc-location-groups.test.ts`
Expected: FAIL on the second assertion — the `<article>` exists but carries no `data-group` attribute.

- [ ] **Step 3: Style `cc-lang-switch`**

In `src/components/cc-lang-switch.ts`, add the import and the styles block. The select is a compact control in the header, so it overrides the full-width default from `controls`:

```ts
import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import type { Locale } from "#lib/i18n/index";
import { getLocale, setLocale, t } from "#lib/i18n/index";
import { base, controls } from "#styles/shared";

const LOCALES: readonly Locale[] = ["en", "th"];

@customElement("cc-lang-switch")
export class CcLangSwitch extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			:host {
				display: inline-block;
			}

			select {
				width: auto;
				padding: var(--cc-space-1) var(--cc-space-2);
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}
		`,
	];
```

Leave `onChange`, `render` and `updated` unchanged.

- [ ] **Step 4: Style `cc-location-groups` and add the markup hook**

In `src/components/cc-location-groups.ts`, add the import and styles, and add `data-group` to the `<article>`:

```ts
import { css, html, LitElement } from "lit";
// ...existing imports...
import { base, panel } from "#styles/shared";

@customElement("cc-location-groups")
export class CcLocationGroups extends LitElement {
	static override styles = [
		base,
		panel,
		css`
			details {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			summary {
				font-size: var(--cc-text-lg);
				font-weight: 600;
				cursor: pointer;
			}

			article[data-group] {
				gap: var(--cc-space-2);
				background: var(--cc-surface-sunken);
			}

			article[data-group] h3 {
				font-size: var(--cc-text-md);
				font-weight: 600;
			}

			ul {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-1);
			}

			li {
				font-size: var(--cc-text-sm);
			}
		`,
	];
```

and in `render()`, change the opening tag of the per-group article:

```ts
						<article data-group>
```

Everything else in `render()`, including the grouping comment about UTF-16 collation, stays as it is.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/components/cc-location-groups.test.ts src/components/cc-lang-switch.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and the checks**

Run: `bun test && bun run typecheck && bun run check`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
bun run format
git add src/components/cc-lang-switch.ts src/components/cc-location-groups.ts src/components/cc-location-groups.test.ts
git commit -m "$(cat <<'EOF'
feat: style the language picker and the location groups

Both rendered into a shadow root with no styles of their own, so neither
had ever been styled by anything. The picker becomes a compact header
control; the groups become sunken panels inside the disclosure.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `cc-due-list` — table, phone stacking, urgency badge

**Files:**
- Modify: `src/components/cc-due-list.ts:1-22` (imports and styles), `:50-88` (the table markup)
- Test: `src/components/cc-due-list.test.ts` (one new test)

**Interfaces:**
- Consumes: `base`, `controls`, `dataTable` from `#styles/shared`.
- Produces: the `data-label` / `data-numeric` cell convention that Task 5 reuses on `cc-card-table`.

- [ ] **Step 1: Write the failing test**

Append to `src/components/cc-due-list.test.ts`, reusing the file's existing `card`, `purchases` and `mount`:

```ts
test("labels every cell so the row stays readable once stacked", async () => {
	const element = await mount(
		[{ card, statement: buildStatement(card, "2026-09", purchases) }],
		"2026-09-25",
	);

	const labels = [
		...(element.shadowRoot?.querySelectorAll("tbody td[data-label]") ?? []),
	].map((cell) => cell.getAttribute("data-label"));

	expect(labels).toEqual(["Card", "Where", "Closes", "Due", "Total"]);
	expect(
		element.shadowRoot?.querySelector('td[data-numeric]')?.textContent,
	).toContain("฿350.00");
});

test("shows an urgency badge, not colour alone", async () => {
	const element = await mount(
		[{ card, statement: buildStatement(card, "2026-09", purchases) }],
		"2026-10-10",
	);

	const badge = element.shadowRoot?.querySelector('[data-urgency="overdue"] .badge');
	expect(badge?.textContent).toContain("7 days overdue");
});
```

The badge text comes from the existing `due.overdue` message with `{days}` filled; `2026-10-10` is 7 days past the `2026-10-03` due date this fixture produces.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/cc-due-list.test.ts`
Expected: FAIL — `labels` is `[]` (no cell carries `data-label`) and `badge` is `null`.

- [ ] **Step 3: Replace the styles block**

In `src/components/cc-due-list.ts`, swap the import line and the whole `static styles` block:

```ts
import { css, html, LitElement } from "lit";
// ...existing imports unchanged...
import { base, controls, dataTable } from "#styles/shared";

@customElement("cc-due-list")
export class CcDueList extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		css`
			tbody tr {
				border-left: var(--cc-space-1) solid transparent;
			}

			tbody tr[data-urgency="overdue"] {
				border-left-color: var(--cc-urgency-overdue);
			}

			tbody tr[data-urgency="soon"] {
				border-left-color: var(--cc-urgency-soon);
			}

			.badge {
				display: inline-block;
				padding: 0 var(--cc-space-1);
				font-size: var(--cc-text-xs);
				font-weight: 600;
				border-radius: var(--cc-radius-sm);
				color: var(--cc-text-muted);
			}

			[data-urgency="overdue"] .badge {
				color: var(--cc-urgency-overdue);
				background: var(--cc-danger-surface);
			}

			[data-urgency="soon"] .badge {
				color: var(--cc-urgency-soon);
			}

			.card-name {
				font-weight: 600;
			}

			td[data-label="Card"] {
				flex-direction: column;
				align-items: flex-start;
			}
		`,
	];
```

The three hardcoded hex values and the `#ddd`/`#666` in the deleted block are exactly what the no-literals constraint forbids; none of them survives.

- [ ] **Step 4: Add the cell labels and the badge to the markup**

Still in `render()`, the header row gains `data-numeric` on the total column, and every body cell gains a `data-label` whose value is the same translated column heading:

```ts
		return html`
			<table>
				<thead>
					<tr>
						<th>${t("due.column.card")}</th>
						<th>${t("due.column.where")}</th>
						<th>${t("due.column.closes")}</th>
						<th>${t("due.column.due")}</th>
						<th data-numeric>${t("due.column.total")}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					${sorted.map(({ card, statement }) => {
						const urgency = urgencyOf(statement, this.today);
						return html`
							<tr data-urgency=${urgency}>
								<td data-label=${t("due.column.card")}>
									<a class="card-name" href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.name}</a>
									<small>••••${card.last4}</small>
								</td>
								<td data-label=${t("due.column.where")}>${locationText(card.location)}</td>
								<td data-label=${t("due.column.closes")}>${displayDate(statement.closeDate, getLocale())}</td>
								<td data-label=${t("due.column.due")}>
									${displayDate(statement.dueDate, getLocale())}
									<span class="badge">${this.when(statement)}</span>
								</td>
								<td data-label=${t("due.column.total")} data-numeric>${formatAmount(statement.total)}</td>
								<td>
									${
										urgency === "future"
											? html`<small>${t("due.stillOpen")}</small>`
											: html`<button @click=${() =>
													this.dispatchEvent(
														new CustomEvent("mark-paid", {
															detail: {
																cardId: card.id,
																period: statement.period,
															},
														}),
													)}>${t("due.markPaid")}</button>`
									}
								</td>
							</tr>
						`;
					})}
				</tbody>
			</table>
		`;
```

The `<br />` elements are gone — the stacking CSS and the flex cells place these now. Leave the empty-state branch, the sort, and the `when()` method untouched.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/components/cc-due-list.test.ts`
Expected: PASS, including the pre-existing `[data-urgency='overdue']` and mark-paid tests.

- [ ] **Step 6: Run the whole suite and the checks**

Run: `bun test && bun run typecheck && bun run check`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
bun run format
git add src/components/cc-due-list.ts src/components/cc-due-list.test.ts
git commit -m "$(cat <<'EOF'
feat: make the due list readable on a phone

The table overflowed below about 640px, where this app is most likely to
be opened. Each cell now carries its column heading as data-label, so the
row can stack into label/value pairs once the header row is hidden.

Urgency stops being colour alone: the days-remaining text becomes a badge
that carries the same signal for a reader who cannot see the border.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `cc-card-table` — styles, stacking, and the variant rename

**Files:**
- Modify: `src/components/cc-card-table.ts:1-16` (imports and a new styles block), `:26-59` (markup)
- Test: `src/components/cc-card-table.test.ts:35`, `:43` (existing assertions change)

**Interfaces:**
- Consumes: `base`, `controls`, `dataTable`; the `data-label` convention from Task 4.
- Produces: the `data-variant="quiet"` / `data-variant="danger"` button contract that Tasks 6, 7 and 8 follow.

- [ ] **Step 1: Update the two coupled assertions to the new contract**

In `src/components/cc-card-table.test.ts`, change both occurrences of the Pico selector:

```ts
	expect(
		element.shadowRoot?.querySelector('button[data-variant="danger"]'),
	).not.toBeNull();
```

at line 35, and at line 43:

```ts
	expect(
		element.shadowRoot?.querySelector('button[data-variant="danger"]'),
	).toBeNull();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/cc-card-table.test.ts`
Expected: FAIL on the first changed assertion — the delete button still carries `class="secondary outline"`, so the `data-variant` selector finds nothing.

- [ ] **Step 3: Add the styles block**

```ts
import { css, html, LitElement } from "lit";
// ...existing imports unchanged...
import { base, controls, dataTable } from "#styles/shared";

@customElement("cc-card-table")
export class CcCardTable extends LitElement {
	static override styles = [
		base,
		controls,
		dataTable,
		css`
			.actions {
				display: flex;
				flex-direction: row;
				flex-wrap: wrap;
				gap: var(--cc-space-2);
			}

			.card-id {
				font-family: var(--cc-font-mono);
				font-size: var(--cc-text-xs);
			}

			.archived {
				padding: 0 var(--cc-space-1);
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-sm);
			}
		`,
	];
```

- [ ] **Step 4: Rewrite the markup with labels and variants**

```ts
		return html`
			<table>
				<thead>
					<tr>
						<th>${t("cards.column.id")}</th>
						<th>${t("cards.column.name")}</th>
						<th>${t("cards.column.last4")}</th>
						<th>${t("cards.column.location")}</th>
						<th>${t("cards.column.cycle")}</th>
						<th>${t("cards.column.comment")}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					${this.cards.map((card) => {
						const count = this.purchaseCounts[card.id] ?? 0;
						return html`
							<tr>
								<td data-label=${t("cards.column.id")}>
									<a class="card-id" href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.id}</a>
								</td>
								<td data-label=${t("cards.column.name")}>
									${card.name}${card.archived ? html` <span class="archived">${t("cards.archived")}</span>` : ""}
								</td>
								<td data-label=${t("cards.column.last4")}>••••${card.last4}</td>
								<td data-label=${t("cards.column.location")}>${locationText(card.location)}</td>
								<td data-label=${t("cards.column.cycle")}>${describeCycleText(card.cycle)}</td>
								<td data-label=${t("cards.column.comment")}>${card.comment ?? ""}</td>
								<td>
									<div class="actions" row>
										<button data-variant="quiet" @click=${() => this.emit("edit", card.id)}>${t("common.edit")}</button>
										<button data-variant="quiet" @click=${() => this.emit("archive", card.id)}>
											${card.archived ? t("cards.unarchive") : t("cards.archive")}
										</button>
										${
											count === 0
												? html`<button data-variant="danger"
													@click=${() => this.emit("remove", card.id)}>${t("common.delete")}</button>`
												: html`<small>${t("cards.purchaseCount", { count })}</small>`
										}
									</div>
								</td>
							</tr>
						`;
					})}
				</tbody>
			</table>
		`;
```

Note the edit button changes from the default variant to `quiet`: three filled accent buttons per row is noise, and none of the three is the row's primary action. The test at `:56` that collects `querySelectorAll("button")` and clicks each in order still sees the same three buttons in the same order.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/components/cc-card-table.test.ts`
Expected: PASS, all tests including the emit-order test and the empty-state test.

- [ ] **Step 6: Run the whole suite and the checks**

Run: `bun test && bun run typecheck && bun run check`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
bun run format
git add src/components/cc-card-table.ts src/components/cc-card-table.test.ts
git commit -m "$(cat <<'EOF'
feat: style the card table and name its button variants

Pico's `secondary` and `secondary outline` classes leave with Pico. The
replacement is data-variant, which makes the variant part of the
component's own contract rather than a leftover from a framework that is
no longer installed.

The row also gains per-cell labels so it stacks on a phone, matching what
the due list already does.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `cc-card-form` and `cc-quick-add`

Both are forms rendering into an unstyled shadow root. `cc-card-form` still carries the stale comment `// Pico styles the light DOM, so this component renders without shadow styles of its own.` — that comment is now false and goes with this task.

**Files:**
- Modify: `src/components/cc-card-form.ts:1-12` (imports, styles, delete the stale comment), `:177` (cancel button variant)
- Modify: `src/components/cc-quick-add.ts:1-18` (imports and styles), `:81-98` (markup)
- Test: `src/components/cc-card-form.test.ts` (one new test)

**Interfaces:**
- Consumes: `base`, `controls` from `#styles/shared`; the `data-variant` contract from Task 5.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `src/components/cc-card-form.test.ts`. Its `mount` helper takes an optional card and defaults to `null`, which is create mode:

```ts
test("renders cancel as a quiet button beside the submit", async () => {
	const element = await mount();

	expect(
		element.shadowRoot?.querySelector('button[type="submit"]'),
	).not.toBeNull();
	expect(
		element.shadowRoot?.querySelector('button[data-variant="quiet"]')
			?.textContent,
	).toContain("Cancel");
});
```

The English catalog gives `common.cancel` as `"Cancel"`, which is what the assertion matches.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/cc-card-form.test.ts`
Expected: FAIL — the cancel button still carries `class="secondary"`, so the `data-variant` query returns `null` and `?.textContent` is `undefined`.

- [ ] **Step 3: Style `cc-card-form`**

Replace the import line and the stale comment at `:12` with a styles block:

```ts
import { css, html, LitElement, nothing } from "lit";
// ...existing imports unchanged...
import { base, controls } from "#styles/shared";

@customElement("cc-card-form")
export class CcCardForm extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			form {
				display: grid;
				grid-template-columns: 1fr;
				gap: var(--cc-space-3);
			}

			@media (min-width: 640px) {
				form {
					grid-template-columns: repeat(2, minmax(0, 1fr));
				}

				fieldset,
				.form-actions,
				[role="alert"] {
					grid-column: 1 / -1;
				}
			}

			fieldset {
				flex-direction: row;
				flex-wrap: wrap;
				gap: var(--cc-space-4);
			}

			[role="alert"] {
				padding: var(--cc-space-2) var(--cc-space-3);
				font-size: var(--cc-text-sm);
				color: var(--cc-danger);
				background: var(--cc-danger-surface);
				border-radius: var(--cc-radius-sm);
			}

			.form-actions {
				display: flex;
				flex-direction: row;
				gap: var(--cc-space-2);
			}
		`,
	];

	@property({ attribute: false }) card: Card | null = null;
```

- [ ] **Step 4: Update the form's error line and action row**

In `render()`, the error paragraph drops the `<mark>` (the styles above carry the tone now), and the two buttons move into an actions row:

```ts
					${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}
```

and at the end of the form, replacing the two bare buttons:

```ts
					<div class="form-actions" row>
						<button type="submit">${card ? t("form.save") : t("form.add")}</button>
						<button type="button" data-variant="quiet"
							@click=${() => this.dispatchEvent(new CustomEvent("cancel"))}>${t("common.cancel")}</button>
					</div>
```

Everything in `onSubmit`, `willUpdate`, `updated` and `fail` stays exactly as it is — in particular the create-mode `form.reset()` block and its comment, which depends on the form element still being `this.renderRoot.querySelector("form")`.

- [ ] **Step 5: Style `cc-quick-add`**

```ts
import { css, html, LitElement, nothing } from "lit";
// ...existing imports unchanged...
import { base, controls } from "#styles/shared";

@customElement("cc-quick-add")
export class CcQuickAdd extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			form {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			[role="alert"] {
				padding: var(--cc-space-2) var(--cc-space-3);
				font-size: var(--cc-text-sm);
				color: var(--cc-danger);
				background: var(--cc-danger-surface);
				border-radius: var(--cc-radius-sm);
			}

			.answer {
				padding: var(--cc-space-2) var(--cc-space-3);
				font-size: var(--cc-text-sm);
				color: var(--cc-success);
				background: var(--cc-surface-sunken);
				border-radius: var(--cc-radius-sm);
			}

			button[type="submit"] {
				align-self: stretch;
				text-align: center;
			}
		`,
	];
```

and in `render()`, drop the `<mark>` and `<ins>` wrappers in favour of the classes:

```ts
					${this.errorKey ? html`<p role="alert">${t(this.errorKey)}</p>` : nothing}
```

```ts
					${this.answer ? html`<p class="answer">${this.answer}</p>` : nothing}
```

Leave `value()`, `onSubmit` and the date-field reset comment untouched.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test src/components/cc-card-form.test.ts src/components/cc-quick-add.test.ts`
Expected: PASS. The existing tests assert `textContent`, which is unaffected by dropping `<mark>` and `<ins>`.

- [ ] **Step 7: Run the whole suite and the checks**

Run: `bun test && bun run typecheck && bun run check`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
bun run format
git add src/components/cc-card-form.ts src/components/cc-quick-add.ts src/components/cc-card-form.test.ts
git commit -m "$(cat <<'EOF'
feat: style the card form and the quick-add form

The card form becomes a two-column grid above 640px and a single column
below it; quick-add stays one column, since it lives in a narrow sidebar.
Error lines stop borrowing <mark> and confirmations stop borrowing <ins>
for colour they never actually got inside a shadow root.

Drops the comment claiming Pico styles this component. It never did.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `cc-statement-list`

**Files:**
- Modify: `src/components/cc-statement-list.ts:1-18` (imports and styles), `:28-90` (markup)
- Test: `src/components/cc-statement-list.test.ts` (two existing assertions unchanged, one new test)

**Interfaces:**
- Consumes: `base`, `controls`, `panel`, `dataTable`; the `data-variant` contract from Task 5.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing test**

Append to `src/components/cc-statement-list.test.ts`. Its `mount` helper takes no arguments — it always mounts the same two statements, one paid and one not:

```ts
test("renders the destructive and secondary actions as their variants", async () => {
	const element = await mount();

	expect(
		element.shadowRoot?.querySelector(
			'[data-action="delete-purchase"][data-variant="danger"]',
		),
	).not.toBeNull();
	expect(
		element.shadowRoot?.querySelector(
			'[data-action="unmark-paid"][data-variant="quiet"]',
		),
	).not.toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/components/cc-statement-list.test.ts`
Expected: FAIL — the delete button carries `class="secondary outline"`, not `data-variant`.

- [ ] **Step 3: Add the styles block**

```ts
import { css, html, LitElement } from "lit";
// ...existing imports unchanged...
import { base, controls, dataTable, panel } from "#styles/shared";

@customElement("cc-statement-list")
export class CcStatementList extends LitElement {
	static override styles = [
		base,
		controls,
		panel,
		dataTable,
		css`
			:host {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-4);
			}

			article[data-urgency="overdue"] {
				border-left: var(--cc-space-1) solid var(--cc-urgency-overdue);
			}

			article[data-urgency="soon"] {
				border-left: var(--cc-space-1) solid var(--cc-urgency-soon);
			}

			.period {
				font-size: var(--cc-text-lg);
				font-weight: 600;
			}

			.dates {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.statement-actions {
				display: flex;
				flex-direction: row;
				gap: var(--cc-space-2);
				align-items: center;
			}
		`,
	];
```

- [ ] **Step 4: Rewrite the markup**

```ts
		return html`
			${this.statements.map(
				(statement) => html`
					<article data-urgency=${urgencyOf(statement, this.today)}>
						<header>
							<div>
								<span class="period">${statement.period}</span>
								<span class="dates">${t("statements.header", {
									close: displayDate(statement.closeDate, getLocale()),
									due: displayDate(statement.dueDate, getLocale()),
								})}</span>
							</div>
							<div class="statement-actions" row>
								${
									statement.paid && statement.payment
										? html`<small>${t("statements.paid", { date: displayDate(statement.payment.paidAt, getLocale()) })}</small>
											<button data-action="unmark-paid" data-variant="quiet"
												@click=${() =>
													this.emit("unmark-paid", {
														cardId: statement.cardId,
														period: statement.period,
													})}>${t("statements.unmark")}</button>`
										: html`<button data-action="mark-paid"
											@click=${() =>
												this.emit("mark-paid", {
													cardId: statement.cardId,
													period: statement.period,
												})}>${t("statements.markPaid")}</button>`
								}
							</div>
						</header>

						${
							statement.purchases.length === 0
								? html`<p><small>${t("statements.noPurchases")}</small></p>`
								: html`
									<table>
										<tbody>
											${statement.purchases.map(
												(purchase) => html`
													<tr>
														<td>${displayDate(purchase.date, getLocale())}</td>
														<td>${purchase.note}</td>
														<td data-numeric>${formatAmount(purchase.amount)}</td>
														<td>
															<button data-action="delete-purchase" data-variant="danger"
																@click=${() =>
																	this.emit("delete-purchase", {
																		cardId: purchase.cardId,
																		purchaseId: purchase.id,
																	})}>${t("common.delete")}</button>
														</td>
													</tr>
												`,
											)}
										</tbody>
									</table>
								`
						}

						<footer><strong>${t("statements.total", { amount: formatAmount(statement.total) })}</strong></footer>
					</article>
				`,
			)}
		`;
```

The em dash and `<br />` that separated the period from the dates are gone; the header's flex layout does that now. No purchase cell carries `data-label`: this table has no `<thead>`, so there is no column heading to reprint once it stacks. The empty-state branch and the `emit` helper are unchanged.

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/components/cc-statement-list.test.ts`
Expected: PASS, including the three existing `[data-action=...]` click tests.

- [ ] **Step 6: Run the whole suite and the checks**

Run: `bun test && bun run typecheck && bun run check`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
bun run format
git add src/components/cc-statement-list.ts src/components/cc-statement-list.test.ts
git commit -m "$(cat <<'EOF'
feat: style the statement list as panels

Each statement becomes a bordered panel with its actions in the header and
its total in a footer, separated from the purchase rows. Urgency reuses
the same left-border tokens the due list uses, so a statement reads the
same on either page.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Page layouts

The last of the Pico class names live in the route templates. This task adds the two-column layouts and finishes the variant rename.

**Files:**
- Modify: `src/styles/app.css` (append the layout rules)
- Modify: `src/routes/index.ts:96-114` (dashboard template)
- Modify: `src/routes/cards.ts:113-157` (registry template)
- Modify: `src/routes/card.ts:95-120` (card detail template)
- Test: `src/routes/index.test.ts`, `src/routes/cards.test.ts`, `src/routes/card.test.ts` must keep passing unchanged.

**Interfaces:**
- Consumes: the `.page` shell and `--cc-*` tokens from Task 1; the `data-variant` contract from Task 5.
- Produces: the `.split` / `.split__aside` layout classes.

- [ ] **Step 1: Append the layout rules to `src/styles/app.css`**

```css
/*
 * Below 960px this is the reset's default column flex, with the aside pulled
 * first: on a phone, adding a purchase is why the page is open. At 960px it
 * becomes a grid and `order` goes back to source order.
 */
.split {
	gap: var(--cc-space-5);
}

.split > .split__aside {
	order: -1;
}

@media (min-width: 960px) {
	.split {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
		align-items: start;
	}

	.split > .split__aside {
		order: 0;
		position: sticky;
		top: var(--cc-space-6);
	}
}

.page-heading {
	display: flex;
	flex-direction: column;
	gap: var(--cc-space-1);
}

.page-heading p {
	color: var(--cc-text-muted);
	font-size: var(--cc-text-sm);
}
```

- [ ] **Step 2: Restructure the dashboard template**

In `src/routes/index.ts`, replace the `render(...)` template with:

```ts
		render(
			html`
				<h1>${t("dashboard.title")}</h1>
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				<div class="split">
					<article>
						<h2>${t("dashboard.dueNext")}</h2>
						<cc-due-list .rows=${rows()} .today=${now} @mark-paid=${onMarkPaid}></cc-due-list>
					</article>
					<article class="split__aside">
						<h2>${t("dashboard.addPurchase")}</h2>
						<cc-quick-add .cards=${cards} .today=${now} .answer=${answer} @add=${onAdd}></cc-quick-add>
					</article>
				</div>
				<article>
					<cc-location-groups .rows=${rows()}></cc-location-groups>
				</article>
			`,
			root,
		);
```

The `.page > article` rule in Task 1 only reaches direct children, so add a sibling selector for the wrapped ones — append to `app.css`:

```css
.page .split > article {
	display: flex;
	flex-direction: column;
	gap: var(--cc-space-3);
	padding: var(--cc-space-4);
	background: var(--cc-surface);
	border: var(--cc-border-width) solid var(--cc-border);
	border-radius: var(--cc-radius-md);
	box-shadow: var(--cc-shadow-sm);
}
```

- [ ] **Step 3: Restructure the registry template**

In `src/routes/cards.ts`, wrap the form and backup panels in a split, and rename the three button classes:

```ts
			html`
				<h1>${t("cards.title")}</h1>
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				${
					resetNames.length > 0
						? html`
							<article data-testid="location-reset">
								<p>${t("cards.locationReset", { names: resetNames.join(", ") })}</p>
								<button data-variant="quiet" type="button" @click=${() => {
									resetNames = [];
									paint();
								}}>${t("common.dismiss")}</button>
							</article>
						`
						: nothing
				}
				<div class="split">
					<article>
						<h2>${editing ? t("cards.edit", { name: editing.name }) : t("cards.add")}</h2>
						<cc-card-form
							.card=${editing}
							@save=${onSave}
							@cancel=${() => {
								editing = null;
								paint();
							}}
						></cc-card-form>
					</article>
					<article class="split__aside">
						<h2>${t("cards.backup")}</h2>
						<p><small>${t("cards.backupWarning")}</small></p>
						<button data-variant="quiet" type="button" @click=${onExport}>${t("cards.export")}</button>
						<label>${t("cards.import")} <input type="file" accept="application/json" @change=${onImport} /></label>
					</article>
				</div>
				<article>
					<cc-card-table
						.cards=${cards}
						.purchaseCounts=${counts}
						@edit=${onEdit}
						@archive=${onArchive}
						@remove=${onRemove}
					></cc-card-table>
				</article>
			`
```

Check `src/routes/cards.test.ts` for a selector on `[data-testid="location-reset"] button` before changing the dismiss button; the attribute rename keeps element identity, so a `querySelector("button")` inside that article still matches.

- [ ] **Step 4: Restructure the card detail template**

In `src/routes/card.ts`, group the heading lines and rename the show-older button:

```ts
					? html`
						<div class="page-heading">
							<h1>${card.name} <small>••••${card.last4}</small></h1>
							<p>${locationText(card.location)} — ${describeCycleText(card.cycle)}${card.comment ? ` — ${card.comment}` : ""}</p>
						</div>
						<cc-statement-list
							.statements=${statements()}
							.today=${now}
							@mark-paid=${onMarkPaid}
							@unmark-paid=${onUnmarkPaid}
							@delete-purchase=${onDeletePurchase}
						></cc-statement-list>
						<button data-variant="quiet" @click=${() => {
							shown += PAGE_SIZE;
							paint();
						}}>${t("card.showOlder")}</button>
					`
```

- [ ] **Step 5: Run the route tests**

Run: `bun test src/routes`
Expected: PASS, unchanged. If a test selects `#page > article` or `main > article` directly, the `.split` wrapper broke it — fix the test's selector to match the new nesting rather than flattening the layout back out, and note the change in the commit message.

- [ ] **Step 6: Run the whole suite and the checks**

Run: `bun test && bun run typecheck && bun run check`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
bun run format
git add src/styles/app.css src/routes/index.ts src/routes/cards.ts src/routes/card.ts
git commit -m "$(cat <<'EOF'
feat: lay out the three pages in two columns

Above 960px the dashboard puts the due list beside a sticky quick-add, and
the registry puts the card form beside backup. Below it they stack with
the aside first, because on a phone adding a purchase is the reason the
page is open.

Removes the last of Pico's class names from the route templates.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Visual verification

Nothing in this plan's test suite can see a colour, a width, or a clipped Thai tone mark. This task is where the design is actually checked.

**Files:**
- Modify: whichever style files the pass turns up problems in.
- Test: none.

**Interfaces:**
- Consumes: everything above.
- Produces: the finished design.

- [ ] **Step 1: Seed the app with enough data to judge**

Run: `bun run dev`. In the browser, add at least three cards across all three locations — one with an overdue statement, one due within a week, one still open — and several purchases on each. A dashboard with one row hides every layout problem this plan is meant to fix.

- [ ] **Step 2: Screenshot the matrix**

Twelve screenshots: three pages (`/`, `/cards`, `/card?id=<one you created>`) × two widths (`390px`, `1280px`) × two languages (EN, TH). Use the Playwright MCP browser: `browser_resize` to each width, `browser_navigate` to each page, the in-page language picker to switch locale, `browser_take_screenshot` for each.

- [ ] **Step 3: Check each one against this list**

- No horizontal scrollbar at 390px on any page.
- Both tables are stacked label/value blocks at 390px and real tables at 1280px.
- Thai tone marks and vowels are not clipped, and Thai nav labels do not wrap the header into three lines.
- Amounts are right-aligned and share a column edge (tabular figures).
- Overdue and due-soon rows read as urgent from the badge text with the border ignored.
- Every button is one of the three variants — no unstyled browser-default button anywhere.
- Keyboard `Tab` through each page shows a visible focus ring on every control, including inside shadow roots.

- [ ] **Step 4: Repeat the pass in dark mode**

Switch the OS or browser to dark (`browser_emulate_media` with `colorScheme: "dark"`), then re-check the same list, paying attention to: text contrast on `--cc-surface`, the danger button's border against the dark surface, and the `--cc-danger-surface` tint behind the error banner.

- [ ] **Step 5: Fix what the pass found**

Every fix is a token change in `src/styles/tokens.css` or a rule in `src/styles/app.css` / `src/styles/shared.ts`. A fix that wants a literal value in a component's local `css` is a sign the token vocabulary is missing an entry — add the token instead.

- [ ] **Step 6: Re-run the suite**

Run: `bun test && bun run typecheck && bun run check`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
bun run format
git add src/styles
git commit -m "$(cat <<'EOF'
fix: correct what the visual pass found

Checked all three pages at 390px and 1280px, in English and Thai, in light
and dark. <describe what actually changed>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

If the pass found nothing, skip this commit rather than writing an empty one.

---

## Done when

- `@picocss/pico` appears nowhere in `package.json`, `bun.lock`, or any source file.
- No `class="secondary"` or `class="outline"` remains: `grep -rn 'class="secondary\|class="outline' src` returns nothing.
- No literal colour appears in `src/styles/shared.ts` or any component's `css` block: `grep -rnE '#[0-9a-fA-F]{3,8}\b' src/styles/shared.ts src/components/*.ts` returns nothing.
- The only `px` literals outside `src/styles/tokens.css` are the two breakpoints: `grep -rn 'px' src/styles/shared.ts src/styles/app.css src/components/*.ts` returns nothing but `639px`, `640px` and `960px` inside `@media` conditions, plus the `env(safe-area-inset-*, 0px)` fallbacks in `app.css`.
- `bun test`, `bun run typecheck` and `bun run check` all pass.
- The twelve screenshots from Task 9 show a coherent interface in both languages, both widths, and both themes.
