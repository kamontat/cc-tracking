<script lang="ts">
	import type { ReadyView } from "#lib/domain/home"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { SheetTab } from "#lib/ui/sheet-tab"
	import type { Opened } from "#lib/ui/startup"

	import { onMount, untrack } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import FilterControls from "#components/molecules/FilterControls.svelte"
	import CardListFilter from "#components/organisms/CardListFilter.svelte"
	import CardPanel from "#components/organisms/CardPanel.svelte"
	import ReadyList from "#components/organisms/ReadyList.svelte"
	import { today } from "#lib/domain/date"
	import { DEFAULT_READY_VIEW, READY_DIRS, READY_SORTS, readyResults, readyRows } from "#lib/domain/home"
	import { ownerName, sortOwners } from "#lib/domain/owner"
	import { nameOfLocation, placeOrder, purchasePlaces } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { groupingLabel } from "#lib/ui/group-label"
	import { READY_ADDRESS, readReadyView, writeReadyView } from "#lib/ui/home-query"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { RecordPanel } from "#lib/ui/record-panel.svelte"
	import { sortOrderLabel } from "#lib/ui/sort-label"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * Home's _Ready to use_ tab (`/ready`, RD-22): Cards' control row (`FilterControls`: search,
	 * *Filter*, the sort and group chips and a chip per filter, opening Cards' sheet,
	 * `CardListFilter`), then every card ready for a purchase that matches, as card tiles, by place
	 * and most room first by default. The view lives in the address
	 * (`?q=&f.locations=&f.owners=&sort=&dir=&by=`, rewritten in place, RD-29). A tile opens the card's panel over the tab (`?card=<id>`, `CardPanel`), beside
	 * the list from 900px and over it below. Every address the page writes keeps the open card
	 * (`panel.keep`); a write in the panel reads the cards again.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once. */
		clock?: () => Date
		/** The address bar; tests pass one that records and plays Back and Forward. */
		address?: AddressBar
		/** Makes a payment's id, in the card's panel. */
		newId?: () => string
	}

	const {
		open = () => openRepository(),
		clock = () => new Date(),
		address = browserBar(),
		newId = () => crypto.randomUUID(),
	}: Props = $props()

	/** The store, opened once for the page and its panel. */
	let opening: Promise<Opened> | null = null
	const openOnce = () => {
		opening ??= open()
		return opening
	}

	/** The open card, in the address and history (RD-23). */
	const panel = untrack(() => new RecordPanel({ address, path: READY_ADDRESS, kinds: ["card"] }))

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = untrack(() => today(clock()))
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	// No location is known before the first load, so the address is read again once one lands.
	let view = $state.raw<ReadyView>(untrack(() => readReadyView(address.search(), [])))
	let filterOpen = $state(false)
	/** The tab the filter sheet opens on: the control that opened it. */
	let sheetTab = $state<SheetTab>("filter")
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)

	const locationIds = (money: MoneyData) => money.locations.map((record) => record.id)
	const ownerIds = (money: MoneyData) => money.owners.map((record) => record.id)

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			const money = await loadMoneyData(repo, now)
			view = readReadyView(address.search(), locationIds(money), ownerIds(money))
			data = money
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

	const rows = $derived(data ? readyRows(data, now) : [])
	// The places' names and their order follow the reader's language.
	const places = $derived.by(() => {
		void lang
		return data ? purchasePlaces(data.locations) : []
	})

	// A holder section per owner A to Z by name.
	const ownerOrder = $derived(data ? sortOwners(data.owners).map((owner) => owner.id) : [])

	// Sorted on every paint, so the place sections follow a language switch.
	const order = $derived.by(() => {
		void lang
		return data
			? placeOrder(
					data.locations,
					data.cards.map((c) => c.location),
				)
			: []
	})

	const results = $derived(data ? readyResults(rows, data.groups, view, order, ownerOrder) : null)

	/** How many cards a draft view would show, for the sheet's apply button. */
	const countFor = (draft: ReadyView) => (data ? readyResults(rows, data.groups, draft, order, ownerOrder).count : 0)

	/** The active filters as removable chips; each clears only itself. */
	const chips = $derived.by(() => {
		void lang
		const stored = data?.locations ?? []
		return [
			...view.locations.map((location) => ({
				key: `loc:${location}`,
				label: nameOfLocation(stored, location),
				clear: () => change({ locations: view.locations.filter((l) => l !== location) }),
			})),
			...view.owners.map((owner) => ({
				key: `owner:${owner}`,
				label: ownerName(owner, data?.owners),
				clear: () => change({ owners: view.owners.filter((o) => o !== owner) }),
			})),
		]
	})

	const sortLabel = $derived.by(() => {
		void lang
		return sortOrderLabel(view.sort, view.dir)
	})

	const groupLabel = $derived.by(() => {
		void lang
		return groupingLabel(view.by)
	})

	const change = (next: Partial<ReadyView>) => {
		view = { ...view, ...next }
		address.replace(panel.keep(`${READY_ADDRESS}${writeReadyView(view)}`))
	}

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
			view = readReadyView(address.search(), data ? locationIds(data) : [], data ? ownerIds(data) : undefined)
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
	<div class="ready-main">
		<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
		{#if data && results}
			{#if rows.length > 0}
				<FilterControls
					q={view.q}
					placeholder={tr("cards.searchPlaceholder")}
					onsearch={(q: string) => change({ q })}
					onopen={(tab: SheetTab) => {
						sheetTab = tab
						filterOpen = true
					}}
					count={chips.length}
					sort={sortLabel}
					group={groupLabel}
					{chips} />
			{/if}
			<ReadyList
				{results}
				total={rows.length}
				{places}
				groups={data.groups}
				locations={data.locations}
				owners={data.owners}
				today={now}
				current={panel.record?.kind === "card" ? panel.record.id : null}
				onopencard={(id) => panel.show({ kind: "card", id })} />
			{#if filterOpen}
				<CardListFilter
					heading={tr("ready.filter.title")}
					tab={sheetTab}
					view={{ ...view }}
					defaults={DEFAULT_READY_VIEW}
					fields={READY_SORTS}
					dirs={READY_DIRS}
					locations={data.locations}
					owners={data.owners}
					count={countFor}
					onapply={(next: ReadyView) => {
						filterOpen = false
						change({ ...next })
					}}
					onclose={() => {
						filterOpen = false
					}} />
			{/if}
		{/if}
	</div>
	<CardPanel {panel} open={openOnce} {clock} {newId} onchange={() => void page.load()} />
</div>

<style>
	.ready-main {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
		min-inline-size: 0;
	}
</style>
