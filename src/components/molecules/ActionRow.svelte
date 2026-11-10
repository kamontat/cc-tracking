<script lang="ts">
	import type { Snippet } from "svelte"
	import type { CycleInput } from "#lib/ui/cycle-line"
	import type { IconName } from "#lib/ui/icon-paths"
	import type { ActionKind, RowPart, Say } from "#lib/ui/row-text"

	import CycleLine from "#components/atoms/CycleLine.svelte"
	import SvgIcon from "#components/atoms/SvgIcon.svelte"

	/**
	 * The one row that opens in place (DD-108, DD-165): Needs you, the ledger, Upcoming and the
	 * Lists view. The whole head (the kind's icon or a `lead`, a bold title, a muted subtitle, the
	 * figure and a chevron) is one button with `aria-expanded` and `aria-controls`, and nothing
	 * interactive sits inside it. It toggles the drawer under it: an optional billing cycle line
	 * (`cycle`) or parts (`parts`), then a foot of one sentence (`say`) and the buttons (`actions`).
	 * The owner keeps one row open (`OpenRows`) and passes words already in the reader's language.
	 */
	interface Props {
		kind: ActionKind
		title: string | Snippet
		subtitle: string | Snippet
		/** The details region's id (`OpenRows.detailsId`); the head is `${detailsId}-head`. */
		detailsId: string
		expanded: boolean
		ontoggle: () => void
		/** Names the row for tests and the page: `data-row`. */
		id?: string
		/** Drawn in place of the kind's icon (a ledger row's card chip). */
		lead?: Snippet
		/** The right-hand figure, already signed, and its tone. */
		amount?: { text: string; tone: "out" | "in" | "muted" | "danger" }
		cycle?: CycleInput | undefined
		parts?: RowPart[] | undefined
		/** The one sentence; money figures strong, a late phrase red, the rest muted. */
		say: string | Say
		/** The buttons, at the end of the opened row's foot (DD-110). */
		actions?: Snippet
	}

	const { kind, title, subtitle, detailsId, expanded, ontoggle, id, lead, amount, cycle, parts, say, actions }: Props =
		$props()

	const ICONS: Record<ActionKind, IconName> = {
		waiting: "clock",
		overdue: "alert",
		planned: "clock",
		draft: "transactions",
		purchase: "cards",
		payment: "wallet",
		saved: "bookmark",
	}

	const pieces = $derived(typeof say === "string" ? (say ? [say] : []) : say)
</script>

<div class="a-wrap" data-row={id}>
	<div class="a-row">
		<button
			type="button"
			class="a-hit"
			id={`${detailsId}-head`}
			data-item={kind}
			aria-expanded={expanded ? "true" : "false"}
			aria-controls={detailsId}
			onclick={() => ontoggle()}>
			{#if lead}
				{@render lead()}
			{:else}
				<span class="a-ic" data-kind={kind}><SvgIcon name={ICONS[kind]} /></span>
			{/if}
			<span class="a-text">
				<b class="a-title"
					>{#if typeof title === "string"}
						{title}
					{:else}
						{@render title()}
					{/if}</b
				>
				<span class="a-sub"
					>{#if typeof subtitle === "string"}
						{subtitle}
					{:else}
						{@render subtitle()}
					{/if}</span
				>
			</span>
			{#if amount}
				<b class="amount {amount.tone}" data-numeric>{amount.text}</b>
			{/if}
			<span class="a-chev"><SvgIcon name="chevron" /></span>
		</button>
	</div>
	<section class="a-details" id={detailsId} aria-labelledby={`${detailsId}-head`} hidden={!expanded}>
		{#if cycle}
			<CycleLine input={cycle} />
		{/if}
		{#if parts && parts.length > 0}
			<div class="a-parts">
				{#each parts as part, i (i)}
					<div class="a-part"><span>{part.label}</span><span data-numeric>{part.amount}</span></div>
				{/each}
			</div>
		{/if}
		<div class="a-foot">
			<p class="a-say">
				{#each pieces as piece, i (i)}
					{#if typeof piece === "string"}
						{piece}
					{:else if "money" in piece}
						<span class="a-money" data-numeric>{piece.money}</span>
					{:else}
						<span class="a-late">{piece.late}</span>
					{/if}
				{/each}
			</p>
			{#if actions}
				<div class="a-btns">{@render actions()}</div>
			{/if}
		</div>
	</section>
</div>

<style>
	/* --a-lead-inline is how far the text sits from the row's start: the kind icon and its gap. A
	   host whose lead is another width (the ledger's card chip) sets it to match. */
	.a-wrap {
		--a-lead-inline: calc(var(--cc-space-5) + var(--cc-space-3) + var(--cc-space-3));
		display: flex;
		flex-direction: column;
	}

	.a-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		align-items: center;
	}

	/* The quiet ground reaches the panel's inner edges (DD-105, DD-109); a neutral icon tile,
	   whose fill is that ground, turns to the surface so it still shows. */
	.a-row:has(> button.a-hit:hover) {
		background: var(--cc-surface-sunken);
		box-shadow:
			calc(var(--cc-space-4) * -1) 0 0 var(--cc-surface-sunken),
			var(--cc-space-4) 0 0 var(--cc-surface-sunken);
	}

	.a-row:has(> button.a-hit:hover) .a-ic:not([data-kind="waiting"], [data-kind="overdue"]) {
		background: var(--cc-surface);
	}

	/* So does a neutral tag in the subtitle (a ledger row's *Archived*). */
	.a-row:has(> button.a-hit:hover)
		:global(.tag:not([data-tone], [data-urgency="overdue"], [data-urgency="soon"], [data-urgency="credit"])) {
		background: var(--cc-surface);
	}

	/* Every rule on the head is scoped twice, to outrank app.css's `.page button`. */
	.a-row .a-hit {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		align-self: stretch;
		gap: var(--cc-space-3);
		inline-size: 100%;
		padding: var(--cc-space-3) 0;
		font: inherit;
		font-weight: 400;
		line-height: inherit;
		white-space: normal;
		text-align: start;
		text-decoration: none;
		color: var(--cc-text);
		cursor: pointer;
		background: transparent;
		border: 0;
		border-radius: 0;
	}

	.a-row .a-hit:not(:has(.amount)) {
		grid-template-columns: auto minmax(0, 1fr) auto;
	}

	.a-row .a-hit:hover {
		text-decoration: none;
		background: transparent;
	}

	.a-row .a-hit:focus-visible {
		box-shadow: var(--cc-focus-ring);
	}

	.a-hit .amount {
		font-weight: 650;
		white-space: nowrap;
		text-align: end;
	}

	/* Purchases read red and payments green, always with their sign (UI-07). */
	.a-hit .amount.out,
	.a-hit .amount.danger {
		color: var(--cc-danger);
	}

	.a-hit .amount.in {
		color: var(--cc-success);
	}

	.a-hit .amount.muted {
		color: var(--cc-text-muted);
	}

	.a-chev {
		display: grid;
		place-items: center;
		color: var(--cc-text-muted);
		transition: rotate var(--cc-row-motion) var(--cc-sheet-ease);
	}

	.a-chev :global(.icon),
	.a-ic :global(.icon) {
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
	}

	[aria-expanded="true"] .a-chev {
		rotate: 0.5turn;
	}

	@media (prefers-reduced-motion: reduce) {
		.a-chev {
			transition: none;
		}
	}

	/* What opens under the head, a drawer lined up with the text past the icon (DD-165): the
	   billing cycle line or the parts, then the foot. */
	.a-details {
		display: grid;
		gap: var(--cc-space-3);
		padding-block: 0 var(--cc-space-3);
		padding-inline-start: var(--a-lead-inline);
		min-inline-size: 0;
	}

	.a-details[hidden] {
		display: none;
	}

	/* The foot: one sentence, then the buttons. They share a line while the foot has room for
	   both, whatever the viewport; in a narrow column or on a phone the buttons wrap under the
	   sentence, at their own width, to the end. */
	.a-foot {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cc-space-3);
		min-inline-size: 0;
	}

	.a-btns {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: flex-start;
		gap: var(--cc-space-2);
	}

	/* Never wider than the row, so a third button (a list's Merge) wraps rather than run off a phone. */
	.a-foot .a-btns {
		flex: 0 1 auto;
		max-inline-size: 100%;
		margin-inline-start: auto;
	}

	.a-foot .a-say {
		flex: 1 1 var(--cc-foot-say);
		min-inline-size: 0;
		margin: 0;
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
		overflow-wrap: anywhere;
	}

	.a-foot .a-say:empty {
		display: none;
	}

	.a-money {
		font-weight: 650;
		color: var(--cc-text);
	}

	.a-late {
		font-weight: 650;
		color: var(--cc-danger);
	}

	/* Parts: a label on the left, its amount on the right. */
	.a-parts {
		display: grid;
		gap: var(--cc-space-1);
		font-size: var(--cc-text-sm);
	}

	.a-part {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
		gap: var(--cc-space-3);
		min-inline-size: 0;
	}

	.a-part > :first-child {
		min-inline-size: 0;
		overflow-wrap: anywhere;
	}

	.a-part > [data-numeric] {
		flex: none;
	}

	.a-ic {
		display: grid;
		place-items: center;
		flex: none;
		inline-size: calc(var(--cc-space-5) + var(--cc-space-3));
		block-size: calc(var(--cc-space-5) + var(--cc-space-3));
		color: var(--cc-text-muted);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.a-ic[data-kind="waiting"] {
		color: var(--cc-warning);
		background: var(--cc-warning-surface);
	}

	.a-ic[data-kind="overdue"] {
		color: var(--cc-danger);
		background: var(--cc-danger-surface);
	}

	.a-text {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: calc(var(--cc-space-1) / 2);
		min-inline-size: 0;
		line-height: 1.35;
	}

	.a-title {
		font-weight: 650;
	}

	.a-sub {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--cc-space-1) var(--cc-space-2);
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	/* A row with nothing under its title (a ledger purchase with no note) keeps no gap for it. */
	.a-sub:empty {
		display: none;
	}

	/* An opened row's page actions are links drawn as the primary or quiet button. */
	.a-btns :global(a.btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		color: var(--cc-accent-text);
		text-decoration: none;
		background: var(--cc-accent);
		border: var(--cc-border-width) solid transparent;
		border-radius: var(--cc-radius-sm);
	}

	.a-btns :global(a.btn:hover) {
		text-decoration: none;
		background: var(--cc-accent-hover);
	}

	.a-btns :global(a.btn[data-variant="quiet"]) {
		color: var(--cc-text);
		background: var(--cc-surface-sunken);
		border-color: var(--cc-border);
	}

	.a-btns :global(a.btn[data-variant="quiet"]:hover) {
		background: var(--cc-border);
	}
</style>
