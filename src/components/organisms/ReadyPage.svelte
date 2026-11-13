<script lang="ts">
	import type { ReadySort } from "#lib/domain/home"
	import type { SortDir } from "#lib/domain/sort"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import FilterControls from "#components/molecules/FilterControls.svelte"
	import CardPanel from "#components/organisms/CardPanel.svelte"
	import ReadyList from "#components/organisms/ReadyList.svelte"
	import SortSheet from "#components/organisms/SortSheet.svelte"
	import { canPurchase } from "#lib/domain/card"
	import { today } from "#lib/domain/date"
	import { READY_DIRS, READY_SORTS, readyRows } from "#lib/domain/home"
	import { unassignedCards } from "#lib/domain/limit"
	import { purchasePlaces } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { READY_ADDRESS, type ReadyView, readReadyView, writeReadyView } from "#lib/ui/home-query"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { RecordPanel } from "#lib/ui/record-panel.svelte"
	import { sortOrderLabel } from "#lib/ui/sort-label"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * Home's _Ready to use_ tab (`/ready`, RD-22): the control row with only its sort chip
	 * (`FilterControls`, as on Cards; the chip opens `SortSheet`), then every card ready for a
	 * purchase, as card tiles, in the order kept in the address (`?sort=&dir=`, most room first by default, rewritten in
	 * place, RD-29). A tile opens the card's panel over the tab (`?card=<id>`, `CardPanel`), beside
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
	const panel = new RecordPanel({ address, path: READY_ADDRESS, kinds: ["card"] })

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = today(clock())
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	let view = $state.raw<ReadyView>(readReadyView(address.search()))
	let sortOpen = $state(false)
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

	const rows = $derived(data ? readyRows(data, now) : [])
	// The places' names and their order follow the reader's language.
	const places = $derived.by(() => {
		void lang
		return data ? purchasePlaces(data.locations) : []
	})
	const unassigned = $derived(
		data
			? unassignedCards(data.cards, data.groups).filter((card) => canPurchase(card, data?.locations ?? [])).length
			: 0,
	)

	const sortLabel = $derived.by(() => {
		void lang
		return sortOrderLabel(view.sort, view.dir)
	})

	const sortBy = (sort: ReadySort, dir: SortDir) => {
		view = { sort, dir }
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
			view = readReadyView(address.search())
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
		{#if data}
			{#if rows.length > 0}
				<FilterControls
					onopen={() => {
						sortOpen = true
					}}
					sort={sortLabel} />
			{/if}
			<ReadyList
				{rows}
				{places}
				groups={data.groups}
				today={now}
				{unassigned}
				sort={view.sort}
				dir={view.dir}
				current={panel.record?.kind === "card" ? panel.record.id : null}
				onopencard={(id) => panel.show({ kind: "card", id })} />
			{#if sortOpen}
				<SortSheet
					heading={tr("ready.sort.title")}
					fields={READY_SORTS}
					defaults={READY_DIRS}
					initial="room"
					field={view.sort}
					dir={view.dir}
					shown={rows.length}
					onapply={(sort: ReadySort, dir: SortDir) => {
						sortOpen = false
						sortBy(sort, dir)
					}}
					onclose={() => {
						sortOpen = false
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
