<script lang="ts">
	import type { Card, ListStatus } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import CardChoices from "#components/molecules/CardChoices.svelte"
	import DateRangeChoices from "#components/molecules/DateRangeChoices.svelte"
	import FilterChips from "#components/molecules/FilterChips.svelte"
	import FilterSheet from "#components/organisms/FilterSheet.svelte"
	import { DEFAULT_LISTS_FILTER, type ListsFilter } from "#lib/domain/transactions"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { toggled } from "#lib/ui/toggle"

	const STATUSES: ListStatus[] = ["draft", "sent", "saved"]

	/**
	 * The Lists view's filter sheet (DD-189), under *Filter lists*: *Status*, *Card* (folded past
	 * eight cards, `CardChoices`) and *Date* (with from and to for a custom range) as pill chips,
	 * with no sort, then *Clear all* and *Show N lists*. It edits a draft of `filter`, counted live
	 * by `count`; only the apply button hands it back, once the sheet has slid away (`onapply`).
	 * Close, Escape and the backdrop call `onclose`.
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

	// A copy of the filter the sheet opened with; the page renders a new sheet for a new one.
	// svelte-ignore state_referenced_locally
	let draft = $state.raw<ListsFilter>({ ...filter })

	const shown = $derived(count(draft))
	const showLabel = $derived.by(() => {
		void lang
		if (shown === 0) return t("tx.filter.nothing")
		return t(shown === 1 ? "tx.lists.filter.show.one" : "tx.lists.filter.show.many", { count: shown })
	})
	const statusOptions = $derived(STATUSES.map((status) => ({ value: status, label: tr(`tx.lists.status.${status}`) })))

	const set = (patch: Partial<ListsFilter>) => {
		draft = { ...draft, ...patch }
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<FilterSheet
	heading={tr("tx.lists.filter.title")}
	{shown}
	label={showLabel}
	onclear={() => {
		draft = { ...DEFAULT_LISTS_FILTER, q: draft.q }
	}}
	onapply={() => onapply({ ...draft })}
	{onclose}>
	<FilterChips
		legend={tr("tx.lists.filter.status")}
		name="status"
		options={statusOptions}
		selected={draft.status}
		ontoggle={(status: string) => set({ status: toggled(draft.status, status as ListStatus) })} />
	<CardChoices
		legend={tr("tx.filter.card")}
		{cards}
		selected={draft.cards}
		ontoggle={(id: string) => set({ cards: toggled(draft.cards, id) })} />
	<DateRangeChoices range={draft.range} from={draft.from} to={draft.to} onchange={set} />
</FilterSheet>
