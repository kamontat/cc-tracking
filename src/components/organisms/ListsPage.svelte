<script lang="ts">
	import type { ListsFilter as Filter, ListsGroup } from "#lib/domain/transactions"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { SheetTab } from "#lib/ui/sheet-tab"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import FilterControls from "#components/molecules/FilterControls.svelte"
	import CardPanel from "#components/organisms/CardPanel.svelte"
	import ListIndex from "#components/organisms/ListIndex.svelte"
	import ListPanel from "#components/organisms/ListPanel.svelte"
	import ListsFilter from "#components/organisms/ListsFilter.svelte"
	import { displayDate, today } from "#lib/domain/date"
	import { filterLists } from "#lib/domain/transactions"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { cardLine } from "#lib/ui/card-label"
	import { groupingLabel } from "#lib/ui/group-label"
	import { NEW_LIST_ADDRESS } from "#lib/ui/list-address"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { RecordPanel } from "#lib/ui/record-panel.svelte"
	import { openRepository } from "#lib/ui/startup"
	import { LISTS_ADDRESS, type ListsView, readListsView, writeListsView } from "#lib/ui/tx-query"

	/**
	 * The Lists tab's island (`/transactions/lists`, PRD RD-22): the search row (search, _Filter_,
	 * the group chip and _+ Add list_ at its end, which leads to the builder), the filter chips, and
	 * every purchase list in sections (DD-188). Its settings live in the address
	 * (`?q=&f.statuses=&f.cards=&f.range=&f.from=&f.to=&by=`, RD-29), rewritten in place as they
	 * change. A list opens in its list panel (`?list=<id>`, `ListPanel`), beside the list from 900px
	 * and over it below; a line's card opens the card's panel a step deeper (`?card=<id>`,
	 * `CardPanel`, which wins when both keys are there). Every address the page writes keeps the
	 * open record (`panel.keep`); a write in a panel reads the lists again.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once. */
		clock?: () => Date
		/** The address bar; tests pass one that records and plays Back and Forward. */
		address?: AddressBar
	}

	const { open = () => openRepository(), clock = () => new Date(), address = browserBar() }: Props = $props()

	/** The store, opened once for the page and its panels. */
	let opening: Promise<Opened> | null = null
	const openOnce = () => {
		opening ??= open()
		return opening
	}

	/** The open list, or a line's card, in the address and history (RD-23). */
	const panel = new RecordPanel({ address, path: LISTS_ADDRESS, kinds: ["card", "list"] })

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = today(clock())
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	let view = $state.raw<ListsView>(readListsView(address.search()))
	let sheetOpen = $state(false)
	let sheetTab = $state<SheetTab>("filter")
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)

	const page = createPageState({
		fetch: async () => {
			if (repo) data = await loadMoneyData(repo, now)
		},
		fallbackKey: "home.error.read",
		paint: () => {
			painted++
		},
	})

	const error = $derived.by(() => {
		void lang
		void painted
		return startupFailure ? startupFailure() : page.error
	})

	const change = (next: Partial<ListsView>) => {
		view = { ...view, ...next }
		address.replace(panel.keep(`${LISTS_ADDRESS}${writeListsView(view)}`))
	}
	const setFilter = (patch: Partial<Filter>) => change({ filter: { ...view.filter, ...patch } })

	type Chip = { key: string; label: string; short?: string; clear: () => void }

	/** The filters as removable chips: each status, each card picked, then the date. */
	const chips = $derived.by((): Chip[] => {
		void lang
		if (!data) return []
		const { filter } = view
		const list: Chip[] = filter.status.map((status) => ({
			key: `status:${status}`,
			label: t(`tx.lists.status.${status}`),
			clear: () => setFilter({ status: filter.status.filter((x) => x !== status) }),
		}))
		for (const id of filter.cards) {
			const card = data.cards.find((c) => c.id === id)
			list.push({
				key: `card:${id}`,
				label: cardLine(id, card),
				short: cardLine(id, card, { short: true }),
				clear: () => setFilter({ cards: filter.cards.filter((x) => x !== id) }),
			})
		}
		if (filter.range)
			list.push({
				key: "range",
				label: t(`tx.range.${filter.range}`),
				clear: () => setFilter({ range: "", from: "", to: "" }),
			})
		if (filter.range === "" && (filter.from || filter.to))
			list.push({
				key: "range",
				label: `${filter.from ? displayDate(filter.from, getLocale()) : "…"} – ${filter.to ? displayDate(filter.to, getLocale()) : "…"}`,
				clear: () => setFilter({ from: "", to: "" }),
			})
		return list
	})

	const groupLabel = $derived.by(() => {
		void lang
		return groupingLabel(view.by)
	})

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		const stopPanel = panel.start()
		const removePop = address.onPop(() => {
			view = readListsView(address.search())
		})
		void (async () => {
			const opened = await openOnce()
			if (!opened.ok) {
				startupFailure = opened.message
				return
			}
			repo = opened.repo
			await page.load()
		})()
		return () => {
			unsubscribe()
			removePop()
			stopPanel()
		}
	})
</script>

<div class="panel-layout" data-panel={panel.open ? "" : undefined}>
	<div class="tx-main">
		<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
		{#if data}
			<FilterControls
				q={view.filter.q}
				placeholder={tr("tx.lists.search.placeholder")}
				onsearch={(q: string) => setFilter({ q })}
				onopen={(tab: SheetTab) => {
					sheetTab = tab
					sheetOpen = true
				}}
				count={chips.length}
				group={groupLabel}
				{chips}>
				{#snippet end()}
					<a class="btn tx-fbtn" data-variant="quiet" data-action="add-list" href={NEW_LIST_ADDRESS}>
						<SvgIcon name="plus" />{tr("tx.lists.add")}
					</a>
				{/snippet}
			</FilterControls>
			<ListIndex
				lists={data.lists}
				cards={data.cards}
				groups={data.groups}
				filter={view.filter}
				by={view.by}
				today={now}
				current={panel.record?.kind === "list" ? panel.record.id : null}
				onopenlist={(list) => panel.show({ kind: "list", id: list.id })} />
			{#if sheetOpen}
				{@const money = data}
				<ListsFilter
					tab={sheetTab}
					cards={money.cards.filter(
						(c) => !c.archived || money.lists.some((l) => l.lines.some((x) => x.cardId === c.id)),
					)}
					filter={{ ...view.filter }}
					count={(filter: Filter) => filterLists(money.lists, filter, money.cards, now).length}
					by={view.by}
					onapply={(filter: Filter, by: ListsGroup) => {
						sheetOpen = false
						change({ filter, by })
					}}
					onclose={() => {
						sheetOpen = false
					}} />
			{/if}
		{/if}
	</div>
	<ListPanel {panel} open={openOnce} {clock} onchange={() => void page.load()} />
	<CardPanel {panel} open={openOnce} {clock} onchange={() => void page.load()} />
</div>
