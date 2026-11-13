<script lang="ts" generics="F extends SortField, V extends CardListView<F>">
	import type { Snippet } from "svelte"
	import type { CardsGroup } from "#lib/domain/cards-view"
	import type { Owner } from "#lib/domain/owner"
	import type { SortDir } from "#lib/domain/sort"
	import type { LocationRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { SheetTab } from "#lib/ui/sheet-tab"

	import { onMount } from "svelte"

	import FilterChips from "#components/molecules/FilterChips.svelte"
	import SortChoices from "#components/molecules/SortChoices.svelte"
	import FilterSheet from "#components/organisms/FilterSheet.svelte"
	import { CARDS_GROUPS } from "#lib/domain/cards-view"
	import { OWNERS } from "#lib/domain/owner"
	import { locationName, sortLocations } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { groupingLabel } from "#lib/ui/group-label"
	import { toggled } from "#lib/ui/toggle"

	/**
	 * The filter sheet every list of cards shares (Cards, Home's _Owed_ and _Ready to use_, RD-29),
	 * under `heading`: on its *Filter* tab *Kept in* and *Account holder* (then `holders`' extra
	 * chips, and the list's own sections, `filters`), on *Sort* the field and which way
	 * (`SortChoices`), on *Group* place, account holder, limit group or none; then *Clear all* (back
	 * to `defaults`, the search kept) and *Show N cards*. It edits a draft of `view`, counted live by
	 * `count`; only the apply button hands it back, once the sheet has slid away (`onapply`). Close,
	 * Escape and the backdrop call `onclose`.
	 */
	interface Props {
		heading: string
		/** The tab to open on: the control that opened the sheet. */
		tab?: SheetTab
		view: V
		/** The list's own view: what *Clear all* goes back to. */
		defaults: V
		/** The sort fields, and each one's own direction. */
		fields: readonly F[]
		dirs: Record<F, SortDir>
		/** The stored locations, every one offered, A to Z by shown name. */
		locations: LocationRecord[]
		/** How many cards a view would show. */
		count: (view: V) => number
		/** The draft view, once the sheet has slid away; the page takes the sheet off screen. */
		onapply: (view: V) => void
		/** The reader closed it; the page takes it off screen. */
		onclose: () => void
		/** More chips after the account holders, given the draft and a way to change it. */
		holders?: Snippet<[draft: V, set: (patch: Partial<V>) => void]>
		/** The list's own filter sections, after *Account holder*. */
		filters?: Snippet<[draft: V, set: (patch: Partial<V>) => void]>
	}

	const { heading, tab, view, defaults, fields, dirs, locations, count, onapply, onclose, holders, filters }: Props =
		$props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	// A copy of the view the sheet opened with; the page renders a new sheet for a new view.
	// svelte-ignore state_referenced_locally
	let draft = $state.raw<V>({ ...view })

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

	const set = (patch: Partial<V>) => {
		draft = { ...draft, ...patch }
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<FilterSheet
	{heading}
	{shown}
	label={showLabel}
	onclear={() => {
		draft = { ...defaults, q: draft.q }
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
			ontoggle={(location: string) => set({ locations: toggled(draft.locations, location) } as Partial<V>)} />
		<FilterChips
			legend={tr("ready.filter.owner")}
			name="owner"
			options={ownerOptions}
			selected={draft.owners}
			ontoggle={(owner: string) => set({ owners: toggled(draft.owners, owner as Owner) } as Partial<V>)}>
			{@render holders?.(draft, set)}
		</FilterChips>
		{@render filters?.(draft, set)}
	{/snippet}
	{#snippet sortPart()}
		<SortChoices
			legend={tr("cards.filter.sortBy")}
			{fields}
			defaults={dirs}
			field={draft.sort}
			dir={draft.dir}
			onchange={(pick: { field: F; dir: SortDir }) => set({ sort: pick.field, dir: pick.dir } as Partial<V>)} />
	{/snippet}
	{#snippet groupPart()}
		<FilterChips
			legend={tr("filter.group")}
			name="by"
			options={groupOptions}
			selected={[draft.by]}
			ontoggle={(value: string) => {
				set({ by: value as CardsGroup } as Partial<V>)
			}} />
	{/snippet}
</FilterSheet>
