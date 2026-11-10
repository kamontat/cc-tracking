<script lang="ts">
	import type { CardsSort, CardsView } from "#lib/domain/cards-view"
	import type { Owner } from "#lib/domain/owner"
	import type { LocationRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import FilterChips from "#components/molecules/FilterChips.svelte"
	import FilterSheet from "#components/organisms/FilterSheet.svelte"
	import { CARDS_SORTS, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view"
	import { OWNERS } from "#lib/domain/owner"
	import { locationName, sortLocations } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardsSortLabel } from "#lib/ui/cards-sort"
	import { toggled } from "#lib/ui/toggle"

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

	// A copy of the view the sheet opened with; the page renders a new sheet for a new view.
	// svelte-ignore state_referenced_locally
	let draft = $state.raw<CardsView>({ ...view })

	const shown = $derived(count(draft))
	const places = $derived.by(() => {
		void lang
		return sortLocations(locations).map((record) => ({ value: record.id, label: locationName(record) }))
	})
	const ownerOptions = OWNERS.map((owner) => ({ value: owner, label: owner }))
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

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<FilterSheet
	heading={tr("cards.filter.title")}
	{shown}
	label={showLabel}
	onclear={() => {
		draft = { ...DEFAULT_CARDS_VIEW, q: draft.q }
	}}
	onapply={() => onapply({ ...draft })}
	{onclose}>
	<FilterChips
		legend={tr("ready.filter.location")}
		name="location"
		options={places}
		selected={draft.locations}
		ontoggle={(location: string) => set({ locations: toggled(draft.locations, location) })} />
	<FilterChips
		legend={tr("ready.filter.owner")}
		name="owner"
		options={ownerOptions}
		selected={draft.owners}
		ontoggle={(owner: string) => set({ owners: toggled(draft.owners, owner as Owner) })}>
		<button
			type="button"
			data-variant="quiet"
			data-ungrouped=""
			aria-pressed={draft.ungrouped ? "true" : "false"}
			onclick={() => set({ ungrouped: !draft.ungrouped })}>
			{tr("cards.filter.ungrouped")}
		</button>
	</FilterChips>
	<fieldset class="filter-group">
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
</FilterSheet>

<style>
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
</style>
