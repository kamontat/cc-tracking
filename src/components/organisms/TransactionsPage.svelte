<script lang="ts">
	import type { SortDir } from "#lib/domain/sort"
	import type { CardPayment, PlainDate, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { SheetTab } from "#lib/ui/sheet-tab"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import FilterControls from "#components/molecules/FilterControls.svelte"
	import ListIndex from "#components/organisms/ListIndex.svelte"
	import ListsFilter from "#components/organisms/ListsFilter.svelte"
	import OwedList from "#components/organisms/OwedList.svelte"
	import TxFilter from "#components/organisms/TxFilter.svelte"
	import TxLedger from "#components/organisms/TxLedger.svelte"
	import { displayDate, monthName, today } from "#lib/domain/date"
	import { formatAmount, MINUS } from "#lib/domain/money"
	import { plannedOf } from "#lib/domain/pay"
	import { groupRoom } from "#lib/domain/room"
	import {
		type TxFilter as Filter,
		filterEntries,
		filterLists,
		groupEntries,
		type ListsFilter as ListsFilterValue,
		type ListsGroup,
		ledgerEntries,
		monthSummary,
		owedRows,
		sortEntries,
		type TxGroup,
		type TxSort,
	} from "#lib/domain/transactions"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { cardLine } from "#lib/ui/card-label"
	import { groupingLabel } from "#lib/ui/group-label"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import {
		confirmWaitingList,
		deleteDraftList,
		deletePlannedPayment,
		markPlanPaid,
		mergeSameDayLists,
	} from "#lib/ui/row-actions"
	import { sortOrderLabel } from "#lib/ui/sort-label"
	import { openRepository } from "#lib/ui/startup"
	import { LEDGER_PAGE, readTxView, type TxView, writeTxView } from "#lib/ui/tx-query"

	/**
	 * Transactions' island: a switch between the ledger, the purchase lists and what is owed, with
	 * the view kept in the address (`?view=&q=&type=&card=&range=&from=&to=&sort=&owedSort=`, and
	 * the Lists view's own `lq=&status=&lcard=&lrange=&lfrom=&lto=`, DD-189),
	 * replaced as it changes, so a reload or a shared link lands in the same place. From 900px the
	 * owed list sits beside the ledger. Everything here is the reader's data (PRD DD-172).
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once. */
		clock?: () => Date
		/** The address bar; tests pass one that records each replace. */
		address?: AddressBar
	}

	const { open = () => openRepository(), clock = () => new Date(), address = browserBar() }: Props = $props()

	const VIEWS = ["ledger", "lists", "owed"] as const

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = today(clock())
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	let view = $state.raw<TxView>(readTxView(address.search()))
	// The filter sheet takes a fresh copy of the view, so its draft starts there.
	let sheetOpen = $state(false)
	/** The tab the filter sheet opens on: the control that opened it. */
	let sheetTab = $state<SheetTab>("filter")
	// How many ledger rows show; any search, filter or sort change starts again at one page.
	let limit = $state(LEDGER_PAGE)
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

	const change = (next: Partial<TxView>) => {
		if (next.filter || next.sort || next.dir || next.by) limit = LEDGER_PAGE
		view = { ...view, ...next }
		address.replace(`/transactions${writeTxView(view)}`)
	}
	const setFilter = (patch: Partial<Filter>) => change({ filter: { ...view.filter, ...patch } })
	const setLists = (patch: Partial<ListsFilterValue>) => change({ lists: { ...view.lists, ...patch } })

	/** Runs a write against the store; a failure shows in the banner under `key`. */
	const write = (action: (store: Repository, money: MoneyData) => Promise<void>, key: MessageKey) => {
		const store = repo
		const money = data
		if (!store || !money) return
		void page.guard(() => action(store, money), key)
	}

	const mark = (payment: CardPayment) =>
		write((store, money) => markPlanPaid(store, money, payment, now), "tx.error.markPaid")
	/** Upcoming's *Confirm*: the waiting list saved as is, every line made (DD-108). */
	const confirmList = (list: PurchaseList) =>
		write((store) => confirmWaitingList(store, list.id, clock()), "tx.error.confirmList")
	const removeDraft = (list: PurchaseList) =>
		write((store) => deleteDraftList(store, list.id), "purchaseList.error.delete")
	/** *Merge*: the other same-day lists of its status go into this one (DD-187). */
	const mergeLists = (list: PurchaseList) =>
		write((store) => mergeSameDayLists(store, list.id), "purchaseList.error.merge")
	const remove = (payment: CardPayment) => write((store) => deletePlannedPayment(store, payment), "tx.error.delete")

	type Chip = { key: string; label: string; short?: string; clear: () => void }

	/** A card chip per card picked, then the date's chip: shared by the ledger's and the Lists view's filters. */
	const cardAndDateChips = (
		filter: { cards: string[]; range: Filter["range"]; from: PlainDate | ""; to: PlainDate | "" },
		set: (patch: { cards?: string[]; range?: Filter["range"]; from?: ""; to?: "" }) => void,
	): Chip[] => {
		const list: Chip[] = []
		for (const id of filter.cards) {
			const card = data?.cards.find((c) => c.id === id)
			list.push({
				key: `card:${id}`,
				label: cardLine(id, card),
				short: cardLine(id, card, { short: true }),
				clear: () => set({ cards: filter.cards.filter((x) => x !== id) }),
			})
		}
		if (filter.range)
			list.push({
				key: "range",
				label: t(`tx.range.${filter.range}`),
				clear: () => set({ range: "", from: "", to: "" }),
			})
		if (filter.range === "" && (filter.from || filter.to))
			list.push({
				key: "range",
				label: `${filter.from ? displayDate(filter.from, getLocale()) : "…"} – ${filter.to ? displayDate(filter.to, getLocale()) : "…"}`,
				clear: () => set({ from: "", to: "" }),
			})
		return list
	}

	/** The active filters as removable chips; a card's shows its line form, and its short form on a phone. */
	const chips = $derived.by(() => {
		void lang
		if (!data) return []
		const { filter } = view
		const types: Chip[] = filter.types.map((kind) => ({
			key: `type:${kind}`,
			label: t(kind === "purchase" ? "tx.type.purchase" : "tx.type.payment"),
			clear: () => setFilter({ types: filter.types.filter((x) => x !== kind) }),
		}))
		return [...types, ...cardAndDateChips(filter, setFilter)]
	})

	/** The Lists view's filters as removable chips: each status, then cards and the date. */
	const listChips = $derived.by(() => {
		void lang
		if (!data) return []
		const { lists } = view
		const statuses: Chip[] = lists.status.map((status) => ({
			key: `status:${status}`,
			label: t(`tx.lists.status.${status}`),
			clear: () => setLists({ status: lists.status.filter((x) => x !== status) }),
		}))
		return [...statuses, ...cardAndDateChips(lists, setLists)]
	})

	const narrowed = $derived.by(() => {
		const { filter } = view
		return (
			filter.q.trim() !== "" ||
			filter.types.length > 0 ||
			filter.cards.length > 0 ||
			filter.range !== "" ||
			filter.from !== "" ||
			filter.to !== ""
		)
	})

	const all = $derived(data ? ledgerEntries(data.cards, data.purchases, data.payments) : [])
	const rows = $derived(sortEntries(filterEntries(all, view.filter, now), view.sort, view.dir))
	const sections = $derived(groupEntries(rows, view.by, view.sort, view.dir))

	const summary = $derived.by(() => {
		void lang
		if (!data || narrowed) return null
		const figures = monthSummary(all, data.ledgers, now)
		return {
			title: t("tx.summary.title", { month: monthName(now, getLocale()) }),
			figures: [
				{
					field: "purchases",
					label: t("tx.summary.purchases"),
					text: `${figures.purchases ? MINUS : ""}${formatAmount(figures.purchases)}`,
					tone: "out",
				},
				{
					field: "payments",
					label: t("tx.summary.payments"),
					text: `${figures.payments ? "+" : ""}${formatAmount(figures.payments)}`,
					tone: "in",
				},
				{ field: "owed", label: t("tx.summary.owed"), text: formatAmount(figures.owed), tone: undefined },
			],
		}
	})

	const upcoming = $derived.by(() => {
		if (!data || narrowed) return null
		const money = data
		return {
			lists: money.lists
				.filter((l) => l.status === "sent")
				.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
			planned: plannedOf(money.payments).map((payment) => ({
				payment,
				card: money.cards.find((c) => c.id === payment.cardId),
			})),
			cards: money.cards,
		}
	})

	const rooms = $derived(
		data
			? new Map(data.groups.map((group) => [group.id, groupRoom(group, data.cards, data.ledgers, data.lists, "")]))
			: new Map(),
	)

	const groupLabel = $derived.by(() => {
		void lang
		return groupingLabel(view.by)
	})
	const listsGroupLabel = $derived.by(() => {
		void lang
		return groupingLabel(view.listsBy)
	})

	const sortLabel = $derived.by(() => {
		void lang
		return sortOrderLabel(view.sort, view.dir)
	})

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		void (async () => {
			const opened = await open()
			if (!opened.ok) {
				startupFailure = opened.message
				return
			}
			repo = opened.repo
			await page.load()
		})()
		return unsubscribe
	})
</script>

<div class="tx-grid" data-show={view.view}>
	<div class="tx-main">
		<div class="tx-head">
			<h1>{tr("nav.transactions")}</h1>
			<!-- A fieldset, so the switch is named as a group; app.css draws it, without a fieldset's frame. -->
			<fieldset class="tx-switch">
				{#each VIEWS as name (name)}
					<button
						type="button"
						data-view={name}
						data-variant="quiet"
						aria-pressed={view.view === name}
						data-desktop-current={name === "ledger" && view.view === "owed" ? "" : undefined}
						onclick={() => change({ view: name })}>
						{tr(`tx.view.${name}`)}
					</button>
				{/each}
			</fieldset>
		</div>
		<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
		{#if data}
			<div class="tx-body">
				{#if view.view === "lists"}
					<FilterControls
						q={view.lists.q}
						placeholder={tr("tx.lists.search.placeholder")}
						onsearch={(q: string) => setLists({ q })}
						onopen={(tab: SheetTab) => {
							sheetTab = tab
							sheetOpen = true
						}}
						count={listChips.length}
						group={listsGroupLabel}
						chips={listChips} />
					<ListIndex
						lists={data.lists}
						cards={data.cards}
						groups={data.groups}
						filter={view.lists}
						by={view.listsBy}
						today={now}
						onconfirmlist={confirmList}
						ondeletedraft={removeDraft}
						onmergelists={mergeLists} />
					{#if sheetOpen}
						{@const money = data}
						<ListsFilter
							tab={sheetTab}
							cards={money.cards.filter(
								(c) => !c.archived || money.lists.some((l) => l.lines.some((x) => x.cardId === c.id)),
							)}
							filter={{ ...view.lists }}
							count={(filter: ListsFilterValue) => filterLists(money.lists, filter, money.cards, now).length}
							by={view.listsBy}
							onapply={(lists: ListsFilterValue, listsBy: ListsGroup) => {
								sheetOpen = false
								change({ lists, listsBy })
							}}
							onclose={() => {
								sheetOpen = false
							}} />
					{/if}
				{:else}
					<FilterControls
						q={view.filter.q}
						placeholder={tr("tx.search.placeholder")}
						onsearch={(q: string) => setFilter({ q })}
						onopen={(tab: SheetTab) => {
							sheetTab = tab
							sheetOpen = true
						}}
						count={chips.length}
						sort={sortLabel}
						group={groupLabel}
						{chips} />
					{#if summary}
						<section class="tx-summary" data-testid="summary">
							<div class="tx-summary__head"><h2>{summary.title}</h2></div>
							<div class="tx-summary__figures">
								{#each summary.figures as figure (figure.field)}
									<div data-field={figure.field}>
										<small>{figure.label}</small>
										<b data-numeric data-tone={figure.tone}>{figure.text}</b>
									</div>
								{/each}
							</div>
						</section>
					{/if}
					<TxLedger
						groups={sections}
						entries={rows}
						lists={data.lists}
						ledgers={data.ledgers}
						limitGroups={data.groups}
						today={now}
						filtered={narrowed}
						{limit}
						{upcoming}
						onshowmore={() => {
							limit += LEDGER_PAGE
						}}
						onmarkpaid={mark}
						onconfirmlist={confirmList}
						ondeletepayment={remove} />
					{#if sheetOpen}
						{@const money = data}
						<TxFilter
							tab={sheetTab}
							cards={money.cards.filter((c) => !c.archived || (money.ledgers.get(c.id)?.owed ?? 0) > 0)}
							filter={{ ...view.filter }}
							sort={view.sort}
							dir={view.dir}
							count={(filter: Filter) => filterEntries(all, filter, now).length}
							by={view.by}
							onapply={({ filter, sort, dir, by }: { filter: Filter; sort: TxSort; dir: SortDir; by: TxGroup }) => {
								sheetOpen = false
								change({ filter, sort, dir, by })
							}}
							onclose={() => {
								sheetOpen = false
							}} />
					{/if}
				{/if}
			</div>
		{/if}
	</div>
	{#if data}
		<aside class="tx-owed">
			<OwedList
				rows={owedRows(data.cards, data.ledgers, now, view.owedSort, view.owedDir)}
				groups={data.groups}
				{rooms}
				ledgers={data.ledgers}
				today={now}
				sort={view.owedSort}
				dir={view.owedDir}
				onsort={(owedSort: TxView["owedSort"], owedDir: SortDir) => change({ owedSort, owedDir })} />
		</aside>
	{/if}
</div>

<style>
	fieldset.tx-switch {
		min-inline-size: 0;
		margin: 0;
		border: 0;
	}
</style>
