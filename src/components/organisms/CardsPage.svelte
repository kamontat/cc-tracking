<script lang="ts">
	import type { CardsRooms, CardsView } from "#lib/domain/cards-view"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { SheetTab } from "#lib/ui/sheet-tab"
	import type { Opened } from "#lib/ui/startup"

	import { onMount, untrack } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import CardsGlance from "#components/molecules/CardsGlance.svelte"
	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import FilterControls from "#components/molecules/FilterControls.svelte"
	import CardPanel from "#components/organisms/CardPanel.svelte"
	import CardsFilter from "#components/organisms/CardsFilter.svelte"
	import CardsList from "#components/organisms/CardsList.svelte"
	import { cardsGlance } from "#lib/domain/cards-glance"
	import { cardsResults } from "#lib/domain/cards-view"
	import { today } from "#lib/domain/date"
	import { ownerName, sortOwners } from "#lib/domain/owner"
	import { groupRoom } from "#lib/domain/room"
	import { nameOfLocation, placeOrder } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { takeResetNotice } from "#lib/storage/migrate-locations"
	import { browserBar } from "#lib/ui/address-bar"
	import { readCardsView, writeCardsView } from "#lib/ui/cards-query"
	import { groupingLabel } from "#lib/ui/group-label"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { RecordPanel } from "#lib/ui/record-panel.svelte"
	import { sortOrderLabel } from "#lib/ui/sort-label"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The Cards tab's island (`/cards`, prototype `vCards`, PRD RD-22): the search row (search,
	 * *Filter* and *+ Add card* at its end), the sort and group chips and the filter chips, the glance
	 * panels over the shown cards (DD-210), then the results. The page's static head holds the title and the tabs (_Cards · Limits_, `PageTabs`);
	 * the limit groups are the Limits tab's (`LimitsPage`). The view lives in the address
	 * (`?q=&f.locations=&f.owners=&f.usage=&f.states=&sort=&dir=&by=`, RD-29), rewritten in place as it
	 * changes. Everything here is the reader's data (PRD DD-172).
	 *
	 * A card opens in its detail panel (RD-23, `CardPanel`) at `?card=<id>`, beside the list from
	 * 900px and over it below: a tile's click shows it (pushing from nothing, else rewriting the
	 * entry), and *+ Add card* opens a blank card form there with the address unchanged. Every
	 * address the page writes keeps the open card (`panel.keep`); a write in the panel reads the
	 * list again.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once. */
		clock?: () => Date
		/** The address bar; tests pass one that records and plays Back and Forward. */
		address?: AddressBar
		/** Where the location-reset notice is read from. */
		storage?: Storage
	}

	const {
		open = () => openRepository(),
		clock = () => new Date(),
		address = browserBar(),
		storage = globalThis.localStorage,
	}: Props = $props()

	/** The store, opened once for the page and its card panel. */
	let opening: Promise<Opened> | null = null
	const openOnce = () => {
		opening ??= open()
		return opening
	}

	/** The card panel's place in the address and history (RD-23). */
	const panel = untrack(() => new RecordPanel({ address, path: "/cards", kinds: ["card"] }))

	/** Everything the page draws from, read once per load. */
	type CardsData = { money: MoneyData; rooms: CardsRooms; credits: Map<string, number> }

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = untrack(() => today(clock()))
	let repo: Repository | null = null
	let data = $state.raw<CardsData | null>(null)
	// No location is known before the first load, so the address is read again once one lands.
	let view = $state.raw<CardsView>(untrack(() => readCardsView(address.search(), [])))
	// The filter sheet takes a fresh copy of the view, so its draft starts there.
	let filterOpen = $state(false)
	/** The tab the filter sheet opens on: the control that opened it. */
	let sheetTab = $state<SheetTab>("filter")
	// Read once per page load: the notice is consumed here, not on every paint.
	let resetNames = $state<string[]>([])
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)

	const locationIds = (money: MoneyData) => money.locations.map((record) => record.id)
	const ownerIds = (money: MoneyData) => money.owners.map((record) => record.id)

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			const money = await loadMoneyData(repo, now)
			const rooms: CardsRooms = new Map(
				money.groups.map((group) => [group.id, groupRoom(group, money.cards, money.ledgers, money.lists, "")]),
			)
			const credits = new Map(money.cards.map((c) => [c.id, money.ledgers.get(c.id)?.credit ?? 0]))
			view = readCardsView(address.search(), locationIds(money), ownerIds(money))
			data = { money, rooms, credits }
		},
		fallbackKey: "cards.error.read",
		paint: () => {
			painted++
		},
	})

	const error = $derived.by(() => {
		void lang
		void painted
		return startupFailure ? startupFailure() : page.error
	})

	const change = (next: Partial<CardsView>) => {
		view = { ...view, ...next }
		address.replace(panel.keep(`/cards${writeCardsView(view)}`))
	}

	/** The active filters as removable chips; each clears only itself. */
	const chips = $derived.by(() => {
		void lang
		const places = data?.money.locations ?? []
		return [
			...view.locations.map((location) => ({
				key: `loc:${location}`,
				label: nameOfLocation(places, location),
				clear: () => change({ locations: view.locations.filter((l) => l !== location) }),
			})),
			...view.owners.map((owner) => ({
				key: `owner:${owner}`,
				label: ownerName(owner, data?.money.owners),
				clear: () => change({ owners: view.owners.filter((o) => o !== owner) }),
			})),
			...view.usage.map((usage) => ({
				key: `usage:${usage}`,
				label: t(`cards.usage.${usage}`),
				clear: () => change({ usage: view.usage.filter((u) => u !== usage) }),
			})),
			...view.states.map((state) => ({
				key: `state:${state}`,
				label: t(`cards.state.${state}`),
				clear: () => change({ states: view.states.filter((s) => s !== state) }),
			})),
		]
	})

	// Sorted on every paint, so the sections follow a language switch.
	const order = $derived.by(() => {
		void lang
		return data
			? placeOrder(
					data.money.locations,
					data.money.cards.map((c) => c.location),
				)
			: []
	})

	// A holder section per owner A to Z by name; renamed owners move with their name.
	const ownerOrder = $derived(data ? sortOwners(data.money.owners).map((owner) => owner.id) : [])

	const results = $derived(
		data
			? cardsResults(data.money.cards, data.money.groups, data.rooms, view, order, now, data.money.ledgers, ownerOrder)
			: null,
	)

	// The unarchived cards on show, whatever the grouping; the sort leaves the sums alone.
	const glance = $derived(
		data && results && results.count > 0
			? cardsGlance(
					results.flat ?? (results.sections ?? []).flatMap((section) => section.cards),
					data.rooms,
					data.money.ledgers,
					now,
				)
			: null,
	)

	const countFor = (draft: CardsView) =>
		data
			? cardsResults(data.money.cards, data.money.groups, data.rooms, draft, order, now, data.money.ledgers, ownerOrder)
					.count
			: 0

	const groupLabel = $derived.by(() => {
		void lang
		return groupingLabel(view.by)
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
		resetNames = takeResetNotice(storage)
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		const stopPanel = panel.start()
		const removePop = address.onPop(() => {
			view = data
				? readCardsView(address.search(), locationIds(data.money), ownerIds(data.money))
				: readCardsView(address.search(), [])
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
	<div class="cards-main">
		<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
		{#if resetNames.length > 0}
			<article data-testid="location-reset">
				<p>{tr("cards.locationReset", { names: resetNames.join(", ") })}</p>
				<button
					data-variant="quiet"
					type="button"
					onclick={() => {
						resetNames = []
					}}>
					{tr("common.dismiss")}
				</button>
			</article>
		{/if}
		{#if data && results}
			<div class="cards-body">
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
					{chips}>
					{#snippet end()}
						<button
							type="button"
							class="tx-fbtn"
							data-variant="quiet"
							data-action="add-card"
							onclick={() => panel.blank("card")}>
							<SvgIcon name="plus" />{tr("cards.page.add")}
						</button>
					{/snippet}
				</FilterControls>
				{#if glance}
					<CardsGlance {glance} />
				{/if}
				<CardsList
					{results}
					groups={data.money.groups}
					rooms={data.rooms}
					credits={data.credits}
					ledgers={data.money.ledgers}
					locations={data.money.locations}
					owners={data.money.owners}
					total={data.money.cards.length}
					today={now}
					current={panel.record?.id ?? null}
					onopen={(id: string) => panel.show({ kind: "card", id })} />
				{#if filterOpen}
					<CardsFilter
						tab={sheetTab}
						view={{ ...view }}
						locations={data.money.locations}
						owners={data.money.owners}
						count={countFor}
						onapply={(next: CardsView) => {
							filterOpen = false
							change({ ...next })
						}}
						onclose={() => {
							filterOpen = false
						}} />
				{/if}
			</div>
		{/if}
	</div>
	<CardPanel {panel} open={openOnce} {clock} onchange={() => void page.load()} />
</div>
