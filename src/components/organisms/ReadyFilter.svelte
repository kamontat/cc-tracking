<script lang="ts">
	import type { Owner } from "#lib/domain/owner"
	import type { SortDir } from "#lib/domain/sort"
	import type { LocationRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import FilterChips from "#components/molecules/FilterChips.svelte"
	import SortChoices from "#components/molecules/SortChoices.svelte"
	import FilterSheet from "#components/organisms/FilterSheet.svelte"
	import { READY_DIRS, READY_SORTS, type ReadySort } from "#lib/domain/home"
	import { DEFAULT_READY_FILTER, type ReadyFilter } from "#lib/domain/ready-filter"
	import { nameOfLocation } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { toggled } from "#lib/ui/toggle"

	/**
	 * The new-list picker's filter sheet (DD-103), under *Filter and sort*: *Kept in* (the places
	 * the ready cards are kept in), *Account holder* and *Sort* (room, close or due date, and which
	 * way, `SortChoices`), as pill chips, then *Clear all* and *Show N cards*. It edits a draft of
	 * `filter`, `sort` and `dir`, counted live by `count`; only the
	 * apply button hands it back, once the sheet has slid away (`onapply`). Close, Escape and the
	 * backdrop call `onclose`. A group with nothing to offer is left out.
	 */
	interface Props {
		/** The ids of the places to offer, in order: those the ready cards are kept in. */
		locations: string[]
		/** The stored locations, which name the places offered. */
		records: LocationRecord[]
		/** The account holders to offer: those of the ready cards. */
		owners: Owner[]
		filter: ReadyFilter
		sort: ReadySort
		dir: SortDir
		/** How many cards a filter would show. */
		count: (filter: ReadyFilter) => number
		/** The draft, once the sheet has slid away; the page takes the sheet off screen. */
		onapply: (detail: { filter: ReadyFilter; sort: ReadySort; dir: SortDir }) => void
		/** The reader closed it; the page takes it off screen. */
		onclose: () => void
	}

	const { locations, records, owners, filter, sort, dir, count, onapply, onclose }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	// A copy of the filter and sort the sheet opened with; the page renders a new sheet for new ones.
	// svelte-ignore state_referenced_locally
	let draft = $state.raw<ReadyFilter>({ ...filter })
	// svelte-ignore state_referenced_locally
	let draftSort = $state<ReadySort>(sort)
	// svelte-ignore state_referenced_locally
	let draftDir = $state<SortDir>(dir)

	const shown = $derived(count(draft))
	const showLabel = $derived.by(() => {
		void lang
		if (shown === 0) return t("tx.filter.nothing")
		return t(shown === 1 ? "ready.filter.show.one" : "ready.filter.show.many", { count: shown })
	})
	const placeOptions = $derived.by(() => {
		void lang
		return locations.map((id) => ({ value: id, label: nameOfLocation(records, id) }))
	})
	const ownerOptions = $derived(owners.map((owner) => ({ value: owner, label: owner })))

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<FilterSheet
	heading={tr("tx.filter.title")}
	{shown}
	label={showLabel}
	onclear={() => {
		draft = { ...DEFAULT_READY_FILTER, q: draft.q }
		draftSort = "room"
		draftDir = READY_DIRS.room
	}}
	onapply={() => onapply({ filter: { ...draft }, sort: draftSort, dir: draftDir })}
	{onclose}>
	{#if locations.length > 0}
		<FilterChips
			legend={tr("ready.filter.location")}
			name="location"
			options={placeOptions}
			selected={draft.locations}
			ontoggle={(location: string) => {
				draft = { ...draft, locations: toggled(draft.locations, location) }
			}} />
	{/if}
	{#if owners.length > 0}
		<FilterChips
			legend={tr("ready.filter.owner")}
			name="owner"
			options={ownerOptions}
			selected={draft.owners}
			ontoggle={(owner: string) => {
				draft = { ...draft, owners: toggled(draft.owners, owner as Owner) }
			}} />
	{/if}
	<SortChoices
		legend={tr("tx.filter.sort")}
		fields={READY_SORTS}
		defaults={READY_DIRS}
		field={draftSort}
		dir={draftDir}
		onchange={(pick: { field: ReadySort; dir: SortDir }) => {
			draftSort = pick.field
			draftDir = pick.dir
		}} />
</FilterSheet>
