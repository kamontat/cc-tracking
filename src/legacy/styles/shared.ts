import { css, unsafeCSS } from "lit"

import { GROUP_COLORS } from "#lib/domain/group-color"

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
`

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

	/* Drop the UA's own arrow and paint one, so a select's right inset is a token like every
	   other control's rather than whatever the browser reserves for itself. The padding leaves
	   the chevron a matching gutter on both sides, so long option text never runs under it.
	   Only the painting changes — the native dropdown still opens as it always did. */
	select {
		appearance: none;
		-webkit-appearance: none;
		padding-right: calc(var(--cc-space-3) * 2 + var(--cc-select-chevron-size));
		background-image: var(--cc-select-chevron);
		background-repeat: no-repeat;
		background-position: right var(--cc-space-3) center;
		background-size: var(--cc-select-chevron-size);
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
		letter-spacing: var(--cc-tracking-label);
	}

	p[role="alert"] {
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		color: var(--cc-danger);
		background: var(--cc-danger-surface);
		border-radius: var(--cc-radius-sm);
	}

	:focus-visible {
		outline: none;
		box-shadow: var(--cc-focus-ring);
	}

	/* forced-colors strips box-shadow, and outline is already none above, so without this a
	   focused control has no visible indicator at all under that mode. */
	@media (forced-colors: active) {
		:focus-visible {
			outline: 2px solid;
		}
	}
`

/** A bordered, padded surface. `data-tone="danger"` tints it for error states. */
export const panel = css`
	article {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
		padding: var(--cc-space-4) var(--cc-panel-padding) var(--cc-panel-padding);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
		box-shadow: var(--cc-shadow-sm);
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
`

/**
 * A one-token label beside a name: archived, supplementary. Held on one line, since a badge
 * broken across two lines breaks its background box with it.
 */
export const badge = css`
	.badge {
		display: inline-block;
		padding: 0 var(--cc-space-1);
		font-size: var(--cc-text-xs);
		font-weight: 500;
		color: var(--cc-text-muted);
		white-space: nowrap;
		vertical-align: middle;
		background: var(--cc-surface-sunken);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-sm);
	}
`

/**
 * One rule per group colour, setting the three properties coloured elements read: `--g-bg` (the
 * pastel), `--g-fg` (its text) and `--g-soft` (a tint of the pastel). A shadow root that renders
 * a `[data-g]` element includes this; app.css keeps a copy for the light-DOM pages.
 */
export const groupInk = unsafeCSS(
	GROUP_COLORS.map(
		(name) => `[data-g="${name}"] {
	--g-bg: var(--cc-group-${name});
	--g-fg: var(--cc-group-${name}-text);
	--g-soft: var(--cc-group-${name}-soft);
}`,
	).join("\n"),
)

/**
 * The pieces a card's name is drawn from (card-label.ts, UI-14): `.mini`, the last-4 chip in the
 * group's pastel (`data-g` a colour name, `data-big` for the payment sheet's card), `.card-panel`, the
 * chip and `id) name` side by side, `.cl-short` hidden by default (a `cardLineHtml` pair shows its
 * full form unless a narrow place swaps it in its own media or container query), and
 * `.tag`, a pill with a dot that carries a word as well as a colour (`data-urgency` from
 * `payTag`). app.css keeps a copy of `.mini` and `.card-panel` for the light-DOM pages.
 */
export const cardBits = css`
	${groupInk}

	.card-panel {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		gap: var(--cc-space-2);
		min-inline-size: 0;
	}

	.cl-short {
		display: none;
	}

	.mini {
		display: inline-grid;
		place-items: end start;
		flex: none;
		inline-size: calc(var(--cc-space-5) + var(--cc-space-3));
		block-size: calc(var(--cc-space-5) + var(--cc-space-1) / 2);
		padding: calc(var(--cc-space-1) / 2) var(--cc-space-1);
		font-family: var(--cc-font-mono);
		font-size: calc(var(--cc-text-xs) * 0.8);
		font-weight: 700;
		line-height: 1;
		color: var(--cc-text-muted);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-xs);
	}

	.mini[data-big] {
		inline-size: calc(var(--cc-space-7) + var(--cc-space-1));
		block-size: calc(var(--cc-space-5) + var(--cc-space-3) - var(--cc-space-1) / 2);
		font-size: calc(var(--cc-text-xs) * 0.88);
	}

	.mini[data-g] {
		color: var(--g-fg);
		background: var(--g-bg);
	}

	.tag {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		align-self: flex-start;
		gap: calc(var(--cc-space-1) * 1.25);
		padding: 0 var(--cc-space-2);
		font-size: var(--cc-text-xs);
		font-weight: 650;
		line-height: 1.6;
		white-space: nowrap;
		color: var(--cc-text-muted);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-pill);
	}

	.tag::before {
		content: "";
		inline-size: calc(var(--cc-space-1) * 1.5);
		block-size: calc(var(--cc-space-1) * 1.5);
		background: currentColor;
		border-radius: var(--cc-radius-pill);
	}

	.tag[data-urgency="overdue"] {
		color: var(--cc-danger);
		background: var(--cc-danger-surface);
	}

	.tag[data-urgency="soon"] {
		color: var(--cc-warning);
		background: var(--cc-warning-surface);
	}

	.tag[data-urgency="credit"] {
		color: var(--cc-success);
		background: var(--cc-accent-surface);
	}
`

/**
 * Phase 4's row panels (the ledger, Upcoming, owed, lists): one `.panel` holding `.crow` rows
 * with a line between each. A row is a grid -- a leading chip or `.ic` tile, the `.what` (a
 * bold title, a muted `.word`, then a `.sub` line), and a right-aligned `.r` figure. `.out`
 * marks money going out (red), `.in` money coming in (green). `.tag[data-tone]` tints a status pill that carries no urgency.
 * A row that is a plain container with its own controls inside (the picker's, DD-150) sets
 * `data-toggle` to take the same hover.
 */
export const rowPanel = css`
	.panel {
		display: flex;
		flex-direction: column;
		padding: 0 var(--cc-space-4);
		overflow: clip;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.panel > * + * {
		border-top: var(--cc-border-width) solid var(--cc-border);
	}

	.crow {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		align-self: stretch;
		gap: var(--cc-space-1) var(--cc-space-3);
		padding: var(--cc-space-3) 0;
		font: inherit;
		font-size: var(--cc-text-md);
		font-weight: 400;
		line-height: var(--cc-leading);
		white-space: normal;
		text-align: start;
		text-decoration: none;
		color: var(--cc-text);
		cursor: pointer;
		background: transparent;
		border: 0;
		border-radius: 0;
	}

	.crow:any-link,
	button.crow {
		color: var(--cc-text);
	}

	/* After and above the rows' own border: 0 resets (.crow, a picker's button[data-card]),
	   so a line is always drawn between rows of any kind. */
	.panel > * + :is(.crow, button, a, div, section, article) {
		border-top: var(--cc-border-width) solid var(--cc-border);
	}

	/* Hover is a quiet ground, never an underline (DD-105). The two side shadows carry the
	   ground across the panel's side padding to its inner edges (DD-109); the panel clips them
	   at its rounded corners, and the lines between rows stay whole. A neutral badge, whose
	   fill is that ground, turns to the surface so it still shows. Focus keeps its ring (UI-16). */
	button.crow:hover,
	.crow:any-link:hover,
	.crow[data-toggle]:hover {
		text-decoration: none;
		background: var(--cc-surface-sunken);
		box-shadow:
			calc(var(--cc-space-4) * -1) 0 0 var(--cc-surface-sunken),
			var(--cc-space-4) 0 0 var(--cc-surface-sunken);
	}

	button.crow:hover .tag:not([data-tone], [data-urgency="overdue"], [data-urgency="soon"], [data-urgency="credit"]),
	.crow:any-link:hover .tag:not([data-tone], [data-urgency="overdue"], [data-urgency="soon"], [data-urgency="credit"]),
	.crow[data-toggle]:hover .tag:not([data-tone], [data-urgency="overdue"], [data-urgency="soon"], [data-urgency="credit"]) {
		background: var(--cc-surface);
	}

	button.crow:focus-visible,
	.crow:any-link:focus-visible {
		box-shadow: var(--cc-focus-ring);
	}

	.what {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: calc(var(--cc-space-1) / 2);
		min-inline-size: 0;
		line-height: 1.35;
	}

	.what b {
		font-weight: 650;
	}

	.word,
	.sub {
		font-size: var(--cc-text-xs);
		font-weight: 400;
		color: var(--cc-text-muted);
	}

	.sub {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--cc-space-2);
	}

	.r {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: var(--cc-space-1);
		line-height: 1.25;
		text-align: end;
	}

	.r small {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.amount {
		font-weight: 650;
		white-space: nowrap;
	}

	/* Purchases read red and payments green, always with their sign and word (UI-07). */
	.amount.out,
	.amount.danger {
		color: var(--cc-danger);
	}

	.amount.in {
		color: var(--cc-success);
	}

	.amount.muted {
		color: var(--cc-text-muted);
	}

	.ic {
		display: grid;
		place-items: center;
		flex: none;
		inline-size: calc(var(--cc-space-5) + var(--cc-space-3));
		block-size: calc(var(--cc-space-5) + var(--cc-space-3));
		color: var(--cc-warning);
		background: var(--cc-warning-surface);
		border-radius: var(--cc-radius-sm);
	}

	.ic .icon {
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
	}

	.tag[data-tone="warn"] {
		color: var(--cc-warning);
		background: var(--cc-warning-surface);
	}

	.tag[data-tone="ok"] {
		color: var(--cc-success);
		background: var(--cc-accent-surface);
	}

	.empty {
		padding: var(--cc-space-4);
		color: var(--cc-text-muted);
	}
`
