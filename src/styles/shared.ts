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
		letter-spacing: 0.04em;
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

	/* A date is one value: it breaks across lines far sooner than a note should. */
	td.date {
		white-space: nowrap;
	}

	/*
	 * The last row's rule would otherwise double up with the panel's own edge,
	 * or with a footer's border-top.
	 */
	tbody tr:last-child td {
		border-bottom: 0;
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

		tbody tr:last-child {
			border-bottom: 0;
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

		/*
		 * A labelled cell is pushed right by its own label. An unlabelled one is
		 * a lone flex item, so text-align never gets a say -- it has to be placed
		 * at the end of the row instead.
		 */
		td[data-numeric]:not([data-label]) {
			justify-content: flex-end;
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
