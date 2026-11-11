<script lang="ts">
	import type { SortDir } from "#lib/domain/sort"
	import type { Card } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { SheetTab } from "#lib/ui/sheet-tab"

	import { onMount } from "svelte"

	import CardChoices from "#components/molecules/CardChoices.svelte"
	import DateRangeChoices from "#components/molecules/DateRangeChoices.svelte"
	import FilterChips from "#components/molecules/FilterChips.svelte"
	import SortChoices from "#components/molecules/SortChoices.svelte"
	import FilterSheet from "#components/organisms/FilterSheet.svelte"
	import {
		DEFAULT_TX_FILTER,
		TX_DIRS,
		TX_GROUPS,
		TX_SORTS,
		type TxFilter,
		type TxGroup,
		type TxSort,
	} from "#lib/domain/transactions"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { groupingLabel } from "#lib/ui/group-label"
	import { toggled } from "#lib/ui/toggle"

	const TYPES = ["purchase", "payment"] as const

	/**
	 * The Transactions filter sheet, under *Filter and sort*: *Type*, *Card* (folded past eight
	 * cards, `CardChoices`), *Date* (with from and to for a custom range) and *Sort* (date or
	 * amount, and which way, `SortChoices`), as pill chips, then *Clear all* and *Show N results*.
	 * *Group by* (day, card or none), then *Clear all* and *Show N results*. It edits a draft of `filter`, `sort`, `dir` and `by`,
	 * counted live by `count` so a dead end is seen before it is applied; only the apply button
	 * hands it back, once the sheet has slid away (`onapply`). Close, Escape and the backdrop call
	 * `onclose`.
	 */
	interface Props {
		/** The tab to open on: the control that opened the sheet. */
		tab?: SheetTab
		cards: Card[]
		filter: TxFilter
		sort: TxSort
		dir: SortDir
		by: TxGroup
		/** How many rows a filter would show. */
		count: (filter: TxFilter) => number
		/** The draft, once the sheet has slid away; the page takes the sheet off screen. */
		onapply: (detail: { filter: TxFilter; sort: TxSort; dir: SortDir; by: TxGroup }) => void
		/** The reader closed it; the page takes it off screen. */
		onclose: () => void
	}

	const { cards, filter, sort, dir, by, count, onapply, onclose, tab }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	// A copy of the filter and sort the sheet opened with; the page renders a new sheet for new ones.
	// svelte-ignore state_referenced_locally
	let draft = $state.raw<TxFilter>({ ...filter })
	// svelte-ignore state_referenced_locally
	let draftSort = $state<TxSort>(sort)
	// svelte-ignore state_referenced_locally
	let draftDir = $state<SortDir>(dir)
	// svelte-ignore state_referenced_locally
	let draftBy = $state<TxGroup>(by)

	const shown = $derived(count(draft))
	const showLabel = $derived.by(() => {
		void lang
		if (shown === 0) return t("tx.filter.nothing")
		return t(shown === 1 ? "tx.filter.show.one" : "tx.filter.show.many", { count: shown })
	})
	const typeOptions = $derived(
		TYPES.map((type) => ({ value: type, label: tr(type === "purchase" ? "tx.type.purchase" : "tx.type.payment") })),
	)

	const groupOptions = $derived.by(() => {
		void lang
		return TX_GROUPS.map((value) => ({ value, label: groupingLabel(value) }))
	})

	const set = (patch: Partial<TxFilter>) => {
		draft = { ...draft, ...patch }
	}

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
		draft = { ...DEFAULT_TX_FILTER, q: draft.q }
		draftSort = "date"
		draftDir = TX_DIRS.date
		draftBy = "day"
	}}
	onapply={() => onapply({ filter: { ...draft }, sort: draftSort, dir: draftDir, by: draftBy })}
	{tab}
	{onclose}>
	{#snippet filterPart()}
		<FilterChips
			legend={tr("tx.filter.type")}
			name="type"
			options={typeOptions}
			selected={draft.types}
			ontoggle={(type: string) => set({ types: toggled(draft.types, type as TxFilter["types"][number]) })} />
		<CardChoices
			legend={tr("tx.filter.card")}
			{cards}
			selected={draft.cards}
			ontoggle={(id: string) => set({ cards: toggled(draft.cards, id) })} />
		<DateRangeChoices range={draft.range} from={draft.from} to={draft.to} onchange={set} />
	{/snippet}
	{#snippet sortPart()}
		<SortChoices
			legend={tr("tx.filter.sort")}
			fields={TX_SORTS}
			defaults={TX_DIRS}
			field={draftSort}
			dir={draftDir}
			onchange={(pick: { field: TxSort; dir: SortDir }) => {
				draftSort = pick.field
				draftDir = pick.dir
			}} />
	{/snippet}
	{#snippet groupPart()}
		<FilterChips
			legend={tr("filter.group")}
			name="by"
			options={groupOptions}
			selected={[draftBy]}
			ontoggle={(value: string) => {
				draftBy = value as TxGroup
			}} />
	{/snippet}
</FilterSheet>
