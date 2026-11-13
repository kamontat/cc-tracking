<script lang="ts">
	import type { CardsSort, CardsView } from "#lib/domain/cards-view"
	import type { Owner } from "#lib/domain/owner"
	import type { SortDir } from "#lib/domain/sort"
	import type { LocationRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { SheetTab } from "#lib/ui/sheet-tab"

	import { onMount } from "svelte"

	import FilterChips from "#components/molecules/FilterChips.svelte"
	import SortChoices from "#components/molecules/SortChoices.svelte"
	import FilterSheet from "#components/organisms/FilterSheet.svelte"
	import { CARDS_DIRS, CARDS_GROUPS, CARDS_SORTS, type CardsGroup, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view"
	import { OWNERS } from "#lib/domain/owner"
	import { locationName, sortLocations } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { groupingLabel } from "#lib/ui/group-label"
	import { toggled } from "#lib/ui/toggle"

	/**
	 * The Cards page's filter sheet, drawn like Transactions': *Kept in*, *Account holder* and
	 * *Sort by* (the field and which way, `SortChoices`) and *Group by*, under the heading *Filter cards*, then *Clear all* and *Show N
	 * cards*. It edits a draft of `view`, counted live by `count`; only the apply button hands it
	 * back, once the sheet has slid away (`onapply`). Close, Escape and the backdrop call `onclose`.
	 */
	interface Props {
		/** The tab to open on: the control that opened the sheet. */
		tab?: SheetTab
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

	const { view, locations, count, onapply, onclose, tab }: Props = $props()

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

	const groupOptions = $derived.by(() => {
		void lang
		return CARDS_GROUPS.map((value) => ({ value, label: groupingLabel(value) }))
	})

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
	{tab}
	{onclose}>
	{#snippet filterPart()}
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
			ontoggle={(owner: string) => set({ owners: toggled(draft.owners, owner as Owner) })} />
	{/snippet}
	{#snippet sortPart()}
		<SortChoices
			legend={tr("cards.filter.sortBy")}
			fields={CARDS_SORTS}
			defaults={CARDS_DIRS}
			field={draft.sort}
			dir={draft.dir}
			onchange={(pick: { field: CardsSort; dir: SortDir }) => set({ sort: pick.field, dir: pick.dir })} />
	{/snippet}
	{#snippet groupPart()}
		<FilterChips
			legend={tr("filter.group")}
			name="by"
			options={groupOptions}
			selected={[draft.by]}
			ontoggle={(value: string) => {
				set({ by: value as CardsGroup })
			}} />
	{/snippet}
</FilterSheet>
