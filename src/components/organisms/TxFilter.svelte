<script lang="ts">
	import type { SortDir } from "#lib/domain/sort"
	import type { Card } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import CardChoices from "#components/molecules/CardChoices.svelte"
	import DateRangeChoices from "#components/molecules/DateRangeChoices.svelte"
	import FilterChips from "#components/molecules/FilterChips.svelte"
	import SortChoices from "#components/molecules/SortChoices.svelte"
	import FilterSheet from "#components/organisms/FilterSheet.svelte"
	import { DEFAULT_TX_FILTER, TX_DIRS, TX_SORTS, type TxFilter, type TxSort } from "#lib/domain/transactions"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { toggled } from "#lib/ui/toggle"

	const TYPES = ["purchase", "payment"] as const

	/**
	 * The Transactions filter sheet, under *Filter and sort*: *Type*, *Card* (folded past eight
	 * cards, `CardChoices`), *Date* (with from and to for a custom range) and *Sort* (date or
	 * amount, and which way, `SortChoices`), as pill chips, then *Clear all* and *Show N results*.
	 * It edits a draft of `filter`, `sort` and `dir`,
	 * counted live by `count` so a dead end is seen before it is applied; only the apply button
	 * hands it back, once the sheet has slid away (`onapply`). Close, Escape and the backdrop call
	 * `onclose`.
	 */
	interface Props {
		cards: Card[]
		filter: TxFilter
		sort: TxSort
		dir: SortDir
		/** How many rows a filter would show. */
		count: (filter: TxFilter) => number
		/** The draft, once the sheet has slid away; the page takes the sheet off screen. */
		onapply: (detail: { filter: TxFilter; sort: TxSort; dir: SortDir }) => void
		/** The reader closed it; the page takes it off screen. */
		onclose: () => void
	}

	const { cards, filter, sort, dir, count, onapply, onclose }: Props = $props()

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

	const shown = $derived(count(draft))
	const showLabel = $derived.by(() => {
		void lang
		if (shown === 0) return t("tx.filter.nothing")
		return t(shown === 1 ? "tx.filter.show.one" : "tx.filter.show.many", { count: shown })
	})
	const typeOptions = $derived(
		TYPES.map((type) => ({ value: type, label: tr(type === "purchase" ? "tx.type.purchase" : "tx.type.payment") })),
	)

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
	}}
	onapply={() => onapply({ filter: { ...draft }, sort: draftSort, dir: draftDir })}
	{onclose}>
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
</FilterSheet>
