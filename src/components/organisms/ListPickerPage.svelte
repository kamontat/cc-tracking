<script lang="ts">
	import type { ReadySort } from "#lib/domain/home"
	import type { ReadyFilter as Filter } from "#lib/domain/ready-filter"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import FilterControls from "#components/molecules/FilterControls.svelte"
	import SubHeaderBar from "#components/molecules/SubHeaderBar.svelte"
	import ReadyFilter from "#components/organisms/ReadyFilter.svelte"
	import ReadyPicker from "#components/organisms/ReadyPicker.svelte"
	import { canPurchase } from "#lib/domain/card"
	import { today } from "#lib/domain/date"
	import { readyRows, sortReady } from "#lib/domain/home"
	import { unassignedCards } from "#lib/domain/limit"
	import { filterReady, readyFilterCount, readyLocations, readyOwners } from "#lib/domain/ready-filter"
	import { nameOfLocation, purchasePlaces } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { newListAddress } from "#lib/ui/list-address"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { type ReadyView, readReadyView, readyViewAddress } from "#lib/ui/ready-query"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The new-list picker, `/list/new` with no `card` (DD-103): *Ready to use* in full under a back
	 * header, with a search box, a Filter button (its badge counts the filters in use), the sort
	 * chip and a removable chip per filter; the filter sheet offers *Kept in*, *Account holder* and
	 * *Sort*. Each card is a tile with a tick; once any is ticked the selection bar offers *Clear*
	 * and *Enter amounts*, which opens `/list/new?card=…` in tap order. The search, filters and
	 * sort live in the address (replaced); the selection lives in memory.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once. */
		clock?: () => Date
		/** The address bar; tests pass one that records each replace. */
		address?: AddressBar
		/** Opens the entering step; `location.assign`, so Back returns to the picker. */
		navigate?: (url: string) => void
	}

	const {
		open = () => openRepository(),
		clock = () => new Date(),
		address = browserBar(),
		navigate = (url: string) => location.assign(url),
	}: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = today(clock())
	const search = address.search()
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	// No location is known before the first load, so the address is read again once one lands.
	let view = $state.raw<ReadyView>(readReadyView(search, []))
	// Tap order, which is the order the entering step opens its lines in.
	let selected = $state.raw<string[]>([])
	// The filter sheet takes a fresh copy of the view, so its draft starts there.
	let sheetOpen = $state(false)
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			const loaded = await loadMoneyData(repo, now)
			// Only the first load reads the address: after it, the view is the page's own.
			if (!data)
				view = readReadyView(
					search,
					loaded.locations.map((record) => record.id),
				)
			data = loaded
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

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	const change = (next: Partial<ReadyView>) => {
		view = { ...view, ...next }
		address.replace(readyViewAddress(view))
	}
	const setFilter = (patch: Partial<Filter>) => change({ filter: { ...view.filter, ...patch } })

	const all = $derived(data ? readyRows(data, now) : [])
	const shown = $derived(sortReady(filterReady(all, view.filter), view.sort))

	// A card that is no longer ready (archived, moved, its group gone) drops out of the pick.
	const picked = $derived.by(() => {
		const ready = new Set(all.map((row) => row.card.id))
		return selected.filter((id) => ready.has(id))
	})

	const toggle = (cardId: string) => {
		selected = picked.includes(cardId) ? picked.filter((id) => id !== cardId) : [...picked, cardId]
	}

	const chips = $derived.by(() => {
		void lang
		const { filter } = view
		return [
			...filter.locations.map((location) => ({
				key: `location:${location}`,
				label: nameOfLocation(data?.locations ?? [], location),
				clear: () => setFilter({ locations: filter.locations.filter((l) => l !== location) }),
			})),
			...filter.owners.map((owner) => ({
				key: `owner:${owner}`,
				label: owner,
				clear: () => setFilter({ owners: filter.owners.filter((o) => o !== owner) }),
			})),
		]
	})

	const detail = $derived.by(() => {
		void lang
		if (!data || all.length === 0) return undefined
		const places = purchasePlaces(data.locations).join(", ")
		return t(all.length === 1 ? "ready.summary.one" : "ready.summary.many", { count: all.length, places })
	})

	const unassigned = $derived(
		data
			? unassignedCards(data.cards, data.groups).filter((card) => canPurchase(card, data?.locations ?? [])).length
			: 0,
	)

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

<SubHeaderBar title={tr("purchaseList.new")} {detail} back="/" />
<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
{#if data}
	{@const money = data}
	{#if all.length === 0}
		<div class="ready-empty" data-empty="none">
			<p>{tr("ready.empty")}</p>
			<p>{tr("quickAdd.noEligible")}</p>
			<a data-action="settings" href="/settings/locations">{tr("ready.toSettings")}</a>
		</div>
	{:else}
		<FilterControls
			q={view.filter.q}
			placeholder={tr("ready.search")}
			onsearch={(q: string) => setFilter({ q })}
			onopen={() => {
				sheetOpen = true
			}}
			count={readyFilterCount(view.filter)}
			sort={tr(`ready.sort.${view.sort}`)}
			{chips} />
		{#if shown.length === 0}
			<p class="placeholder" data-empty="no-match">
				{tr("ready.noMatch")}
				<button
					type="button"
					data-variant="quiet"
					data-action="clear-filters"
					onclick={() => change({ filter: { q: "", locations: [], owners: [] } })}>
					{tr("tx.filter.clear")}
				</button>
			</p>
		{:else}
			<ReadyPicker rows={shown} selected={picked} groups={money.groups} today={now} ontoggle={toggle} />
		{/if}
		{#if sheetOpen}
			<ReadyFilter
				locations={readyLocations(all, money.locations)}
				records={money.locations}
				owners={readyOwners(all)}
				filter={{ ...view.filter }}
				sort={view.sort}
				count={(filter: Filter) => filterReady(all, filter).length}
				onapply={({ filter, sort }: { filter: Filter; sort: ReadySort }) => {
					sheetOpen = false
					change({ filter, sort })
				}}
				onclose={() => {
					sheetOpen = false
				}} />
		{/if}
	{/if}
	{#if unassigned > 0}
		<p class="note" data-testid="unassigned">
			{tr(unassigned === 1 ? "spendable.unassigned.one" : "spendable.unassigned.many", { count: unassigned })}
			<a href="/cards?ungrouped=1">{tr("spendable.unassignedAction")}</a>
		</p>
	{/if}
{/if}
{#if picked.length > 0}
	<div class="action-bar" data-testid="selection">
		<b>{picked.length === 1 ? tr("ready.selected.one") : tr("ready.selected.many", { count: picked.length })}</b>
		<div class="action-bar__actions">
			<button
				type="button"
				data-variant="quiet"
				data-action="clear"
				onclick={() => {
					selected = []
				}}>
				{tr("list.clear")}
			</button>
			<button type="button" data-action="enter-amounts" onclick={() => navigate(newListAddress(picked))}>
				{tr("ready.enterAmounts")}
				›
			</button>
		</div>
	</div>
{/if}
