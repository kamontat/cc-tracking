<script lang="ts">
	import type { CardsView } from "#lib/domain/cards-view"
	import type { LocationRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { SheetTab } from "#lib/ui/sheet-tab"

	import { onMount } from "svelte"

	import CardListFilter from "#components/organisms/CardListFilter.svelte"
	import { CARDS_DIRS, CARDS_SORTS, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * The Cards page's filter sheet: the sheet every list of cards shares (`CardListFilter`) under
	 * the heading *Filter cards*, with Cards' sorts and, after the account holders, *Not in a group*.
	 * Only the apply button hands the draft back, once the sheet has slid away (`onapply`). Close,
	 * Escape and the backdrop call `onclose`.
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

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<CardListFilter
	heading={tr("cards.filter.title")}
	{tab}
	{view}
	defaults={DEFAULT_CARDS_VIEW}
	fields={CARDS_SORTS}
	dirs={CARDS_DIRS}
	{locations}
	{count}
	{onapply}
	{onclose}>
</CardListFilter>
