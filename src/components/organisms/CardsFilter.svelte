<script lang="ts">
	import type { CardsSort, CardsView } from "#lib/domain/cards-view"
	import type { LocationRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import Sheet from "#components/molecules/Sheet.svelte"
	import { CARDS_SORTS, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view"
	import { OWNERS } from "#lib/domain/owner"
	import { locationName, sortLocations } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardsSortLabel } from "#lib/ui/cards-sort"

	/**
	 * The Cards page's filter sheet, drawn like Transactions': *Kept in*, *Account holder* and
	 * *Sort by* (a radio list), under the heading *Filter cards*, then *Clear all* and *Show N
	 * cards*. It edits a draft of `view`, counted live by `count`; only the apply button hands it
	 * back, once the sheet has slid away (`onapply`). Close, Escape and the backdrop call `onclose`.
	 */
	interface Props {
		view: CardsView
		/** The stored locations, every one offered, A to Z by shown name. */
		locations: LocationRecord[]
		/** How many cards a view would show. */
		count: (view: CardsView) => number
		/** The draft view, once the sheet has slid away; the page takes the sheet off screen. */
		onapply: (view: CardsView) => void
		/** The reader closed it; the page takes it off screen. */
		onclose: () => void
	}

	const { view, locations, count, onapply, onclose }: Props = $props()

	const uid = $props.id()
	const sortLegend = `${uid}-sort`

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let sheet: { leave: (then: () => void) => void } | undefined = $state()
	// A copy of the view the sheet opened with; the page renders a new sheet for a new view.
	// svelte-ignore state_referenced_locally
	let draft = $state.raw<CardsView>({ ...view })

	const shown = $derived(count(draft))
	const places = $derived.by(() => {
		void lang
		return sortLocations(locations).map((record) => ({ id: record.id, name: locationName(record) }))
	})
	const showLabel = $derived.by(() => {
		void lang
		if (shown === 0) return t("tx.filter.nothing")
		return t(shown === 1 ? "ready.filter.show.one" : "ready.filter.show.many", { count: shown })
	})

	const sortLabel = (sort: CardsSort) => {
		void lang
		return cardsSortLabel(sort)
	}

	const set = (patch: Partial<CardsView>) => {
		draft = { ...draft, ...patch }
	}

	/** `values` with `value` added, or taken out when it is there. */
	function toggle<T>(values: readonly T[], value: T): T[] {
		return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
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

<Sheet bind:this={sheet} heading={tr("cards.filter.title")} {onclose}>
	<fieldset>
		<legend>{tr("ready.filter.location")}</legend>
		<div class="choices">
			{#each places as place (place.id)}
				<button
					type="button"
					data-variant="quiet"
					data-location={place.id}
					aria-pressed={draft.locations.includes(place.id) ? "true" : "false"}
					onclick={() => set({ locations: toggle(draft.locations, place.id) })}>
					{place.name}
				</button>
			{/each}
		</div>
	</fieldset>
	<fieldset>
		<legend>{tr("ready.filter.owner")}</legend>
		<div class="choices">
			{#each OWNERS as owner (owner)}
				<button
					type="button"
					data-variant="quiet"
					data-owner={owner}
					aria-pressed={draft.owners.includes(owner) ? "true" : "false"}
					onclick={() => set({ owners: toggle(draft.owners, owner) })}>
					{owner}
				</button>
			{/each}
			<button
				type="button"
				data-variant="quiet"
				data-ungrouped=""
				aria-pressed={draft.ungrouped ? "true" : "false"}
				onclick={() => set({ ungrouped: !draft.ungrouped })}>
				{tr("cards.filter.ungrouped")}
			</button>
		</div>
	</fieldset>
	<fieldset>
		<legend id={sortLegend}>{tr("cards.filter.sortBy")}</legend>
		<div class="set" role="radiogroup" aria-labelledby={sortLegend}>
			{#each CARDS_SORTS as sort (sort)}
				<label
					><span>{sortLabel(sort)}</span>
					<input
						type="radio"
						name="sort"
						value={sort}
						checked={draft.sort === sort}
						onchange={() => set({ sort })}></label
				>
			{/each}
		</div>
	</fieldset>
	<div class="footer">
		<button
			type="button"
			data-variant="quiet"
			data-action="clear"
			onclick={() => {
				draft = { ...DEFAULT_CARDS_VIEW, q: draft.q }
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

	/* The sort as a radio list (the prototype's filter sheet): one row per sort on a panel, its
	   words on the left and the radio mark on the right. */
	.set {
		display: flex;
		flex-direction: column;
		padding: 0 var(--cc-space-4);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.set > label {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: var(--cc-space-3);
		padding: var(--cc-space-3) 0;
		color: var(--cc-text);
		cursor: pointer;
	}

	.set > label + label {
		border-top: var(--cc-border-width) solid var(--cc-border);
	}

	.set input[type="radio"] {
		flex: none;
		inline-size: var(--cc-space-5);
		block-size: var(--cc-space-5);
		margin: 0;
		appearance: none;
		cursor: pointer;
		background: var(--cc-surface);
		border: var(--cc-ring-width) solid var(--cc-border);
		border-radius: var(--cc-radius-pill);
	}

	.set input[type="radio"]:checked {
		border: var(--cc-space-2) solid var(--cc-accent);
	}

	@media (forced-colors: active) {
		.set input[type="radio"] {
			appearance: auto;
		}
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
