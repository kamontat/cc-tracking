<script lang="ts">
	import type { RangePreset } from "#lib/domain/purchase-range"
	import type { Card, ListStatus } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import Sheet from "#components/molecules/Sheet.svelte"
	import { DEFAULT_LISTS_FILTER, type ListsFilter } from "#lib/domain/transactions"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine } from "#lib/ui/card-label"

	const RANGES: RangePreset[] = ["today", "week", "month", "lastMonth", "custom"]
	const STATUSES: ListStatus[] = ["draft", "sent", "saved"]

	/**
	 * The Lists view's filter sheet (DD-189), under *Filter lists*: *Status*, *Card* and *Date*
	 * (with from and to for a custom range) as pill chips, with no sort, then *Clear all* and
	 * *Show N lists*. It edits a draft of `filter`, counted live by `count`; only the apply button
	 * hands it back, once the sheet has slid away (`onapply`). Close, Escape and the backdrop call
	 * `onclose`.
	 */
	interface Props {
		cards: Card[]
		filter: ListsFilter
		/** How many lists a filter would show. */
		count: (filter: ListsFilter) => number
		onapply: (filter: ListsFilter) => void
		onclose: () => void
	}

	const { cards, filter, count, onapply, onclose }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let sheet: { leave: (then: () => void) => void } | undefined = $state()
	// A copy of the filter the sheet opened with; the page renders a new sheet for a new one.
	// svelte-ignore state_referenced_locally
	let draft = $state.raw<ListsFilter>({ ...filter })

	const shown = $derived(count(draft))
	const showLabel = $derived.by(() => {
		void lang
		if (shown === 0) return t("tx.filter.nothing")
		return t(shown === 1 ? "tx.lists.filter.show.one" : "tx.lists.filter.show.many", { count: shown })
	})

	const set = (patch: Partial<ListsFilter>) => {
		draft = { ...draft, ...patch }
	}

	/** `values` with `value` added, or taken out when it is there. */
	function toggle<T>(values: readonly T[], value: T): T[] {
		return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
	}

	const pickRange = (range: RangePreset) => {
		const next = draft.range === range ? "" : range
		set(next === "custom" ? { range: next } : { range: next, from: "", to: "" })
	}

	const apply = () => {
		const value = { ...draft }
		const emit = () => onapply(value)
		if (sheet) sheet.leave(emit)
		else emit()
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<Sheet bind:this={sheet} heading={tr("tx.lists.filter.title")} {onclose}>
	<fieldset>
		<legend>{tr("tx.lists.filter.status")}</legend>
		<div class="choices">
			{#each STATUSES as status (status)}
				<button
					type="button"
					data-variant="quiet"
					data-status={status}
					aria-pressed={draft.status.includes(status) ? "true" : "false"}
					onclick={() => set({ status: toggle(draft.status, status) })}>
					{tr(`tx.lists.status.${status}`)}
				</button>
			{/each}
		</div>
	</fieldset>
	<fieldset>
		<legend>{tr("tx.filter.card")}</legend>
		<div class="choices">
			{#each cards as card (card.id)}
				<button
					type="button"
					data-variant="quiet"
					data-card={card.id}
					aria-pressed={draft.cards.includes(card.id) ? "true" : "false"}
					onclick={() => set({ cards: toggle(draft.cards, card.id) })}>
					{cardLine(card.id, card)}
				</button>
			{/each}
		</div>
	</fieldset>
	<fieldset>
		<legend>{tr("tx.filter.date")}</legend>
		<div class="choices">
			{#each RANGES as range (range)}
				<button
					type="button"
					data-variant="quiet"
					data-range={range}
					aria-pressed={draft.range === range ? "true" : "false"}
					onclick={() => pickRange(range)}>
					{tr(`tx.range.${range}`)}
				</button>
			{/each}
		</div>
		{#if draft.range === "custom"}
			<div class="dates">
				<label
					>{tr("tx.filter.from")}
					<input
						type="date"
						name="from"
						value={draft.from}
						oninput={(event) => set({ from: event.currentTarget.value })}></label
				>
				<label
					>{tr("tx.filter.to")}
					<input
						type="date"
						name="to"
						value={draft.to}
						oninput={(event) => set({ to: event.currentTarget.value })}></label
				>
			</div>
		{/if}
	</fieldset>
	<div class="footer">
		<button
			type="button"
			data-variant="quiet"
			data-action="clear"
			onclick={() => {
				draft = { ...DEFAULT_LISTS_FILTER, q: draft.q }
			}}>
			{tr("tx.filter.clear")}
		</button>
		<button type="button" data-action="apply" disabled={shown === 0} onclick={apply}>{showLabel}</button>
	</div>
</Sheet>

<style>
	/* The legacy `filterSheet` look: a muted legend over a wrapping row of pill chips. */
	fieldset {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		min-inline-size: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		margin-bottom: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		font-weight: 400;
		letter-spacing: normal;
		text-transform: none;
		color: var(--cc-text-muted);
	}

	.choices {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--cc-space-2);
	}

	/* Raised over app.css's `.page button`. */
	.choices button[aria-pressed] {
		padding: var(--cc-space-1) var(--cc-space-3);
		font-weight: 400;
		color: var(--cc-text);
		background: var(--cc-surface-sunken);
		border-color: transparent;
		border-radius: var(--cc-radius-pill);
	}

	.choices button[aria-pressed]:hover {
		background: var(--cc-border);
	}

	.choices button[aria-pressed="true"] {
		font-weight: 600;
		color: var(--cc-success);
		background: var(--cc-accent-surface);
	}

	/* A custom range's from and to, side by side while they fit. */
	.dates {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--cc-space-3);
		margin-top: var(--cc-space-2);
	}

	.dates label {
		display: flex;
		flex: 1 1 0;
		flex-direction: column;
		gap: var(--cc-space-1);
	}

	.footer {
		display: flex;
		flex-direction: row;
		gap: var(--cc-space-2);
	}

	.footer button[data-action] {
		padding-block: var(--cc-space-3);
		font-size: var(--cc-text-md);
		font-weight: 650;
	}

	.footer button[data-action="apply"] {
		flex: 1 1 auto;
	}
</style>
