<script lang="ts">
	import type { OwedRow, OwedState, OwedView } from "#lib/domain/owed"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { SheetTab } from "#lib/ui/sheet-tab"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import FilterChips from "#components/molecules/FilterChips.svelte"
	import FilterControls from "#components/molecules/FilterControls.svelte"
	import CardListFilter from "#components/organisms/CardListFilter.svelte"
	import CardPanel from "#components/organisms/CardPanel.svelte"
	import OwedList from "#components/organisms/OwedList.svelte"
	import { today } from "#lib/domain/date"
	import {
		DEFAULT_OWED_VIEW,
		OWED_DIRS,
		OWED_SORTS,
		OWED_STATES,
		owedLeft,
		owedResults,
		owedRows,
	} from "#lib/domain/owed"
	import { groupRoom } from "#lib/domain/room"
	import { nameOfLocation, placeOrder } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { groupingLabel } from "#lib/ui/group-label"
	import { OWED_ADDRESS, readOwedView, writeOwedView } from "#lib/ui/home-query"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { RecordPanel } from "#lib/ui/record-panel.svelte"
	import { sortOrderLabel } from "#lib/ui/sort-label"
	import { openRepository } from "#lib/ui/startup"
	import { toggled } from "#lib/ui/toggle"

	/**
	 * Home's _Owed_ tab (`/owed`, RD-25): Cards' control row (`FilterControls`: search, *Filter*, the
	 * sort and group chips and a chip per filter, opening Cards' sheet, `CardListFilter`, with *Bill*
	 * added), then every card that owes and matches, as payment tiles, flat (most urgent first) or in
	 * Cards' sections. The view lives in the address
	 * (`?q=&f.locations=&f.owners=&f.states=&sort=&dir=&by=`, rewritten in place, RD-29). A tile opens the card's panel over
	 * the tab (`?card=<id>`, `CardPanel`), beside the list from 900px and over it below; _Pay_ on a
	 * tile opens it straight on the pay form with what is left filled in, and the save, _Cancel_ and
	 * ‹ swap the card back in place (RD-24). Every address the page writes keeps the open card
	 * (`panel.keep`); a write in the panel reads the list again, so a paid card leaves it.
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
	const panel = new RecordPanel({ address, path: OWED_ADDRESS, kinds: ["card"] })

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = today(clock())
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	// No location is known before the first load, so the address is read again once one lands.
	let view = $state.raw<OwedView>(readOwedView(address.search(), []))
	let filterOpen = $state(false)
	/** The tab the filter sheet opens on: the control that opened it. */
	let sheetTab = $state<SheetTab>("filter")
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)

	const locationIds = (money: MoneyData) => money.locations.map((record) => record.id)

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			const money = await loadMoneyData(repo, now)
			view = readOwedView(address.search(), locationIds(money))
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

	const rooms = $derived(
		data
			? new Map(data.groups.map((group) => [group.id, groupRoom(group, data.cards, data.ledgers, data.lists, "")]))
			: new Map(),
	)
	const rows = $derived(data ? owedRows(data.cards, data.ledgers, now, view.sort, view.dir) : [])

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

	const results = $derived(data ? owedResults(rows, data.groups, view, order) : null)

	/** How many cards a draft view would show, for the sheet's apply button. */
	const countFor = (draft: OwedView) =>
		data
			? owedResults(owedRows(data.cards, data.ledgers, now, draft.sort, draft.dir), data.groups, draft, order).count
			: 0

	const stateLabel = (state: OwedState) => tr(`owed.state.${state}`)

	/** The active filters as removable chips; each clears only itself. */
	const chips = $derived.by(() => {
		void lang
		const places = data?.locations ?? []
		return [
			...view.locations.map((location) => ({
				key: `loc:${location}`,
				label: nameOfLocation(places, location),
				clear: () => change({ locations: view.locations.filter((l) => l !== location) }),
			})),
			...view.owners.map((owner) => ({
				key: `owner:${owner}`,
				label: owner,
				clear: () => change({ owners: view.owners.filter((o) => o !== owner) }),
			})),
			...view.states.map((state) => ({
				key: `state:${state}`,
				label: stateLabel(state),
				clear: () => change({ states: view.states.filter((s) => s !== state) }),
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

	const stateOptions = $derived.by(() => {
		void lang
		return OWED_STATES.map((value) => ({ value, label: t(`owed.state.${value}`) }))
	})

	const change = (next: Partial<OwedView>) => {
		view = { ...view, ...next }
		address.replace(panel.keep(`${OWED_ADDRESS}${writeOwedView(view)}`))
	}

	/** _Pay_ on a tile: the card's panel straight on its pay form, what is left filled in. */
	const pay = (row: OwedRow) => panel.show({ kind: "card", id: row.card.id }, { name: "pay", arg: `${owedLeft(row)}` })

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
			view = readOwedView(address.search(), data ? locationIds(data) : [])
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
	<div class="owed-main">
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
			<OwedList
				{results}
				total={rows.length}
				groups={data.groups}
				{rooms}
				ledgers={data.ledgers}
				locations={data.locations}
				today={now}
				current={panel.record?.kind === "card" ? panel.record.id : null}
				onopencard={(id) => panel.show({ kind: "card", id })}
				onpay={pay} />
			{#if filterOpen}
				<CardListFilter
					heading={tr("owed.filter.title")}
					tab={sheetTab}
					view={{ ...view }}
					defaults={DEFAULT_OWED_VIEW}
					fields={OWED_SORTS}
					dirs={OWED_DIRS}
					locations={data.locations}
					count={countFor}
					onapply={(next: OwedView) => {
						filterOpen = false
						change({ ...next })
					}}
					onclose={() => {
						filterOpen = false
					}}>
					{#snippet filters(draft: OwedView, set: (patch: Partial<OwedView>) => void)}
						<FilterChips
							legend={tr("owed.filter.state")}
							name="state"
							options={stateOptions}
							selected={draft.states}
							ontoggle={(state: string) => set({ states: toggled(draft.states, state as OwedState) })} />
					{/snippet}
				</CardListFilter>
			{/if}
		{/if}
	</div>
	<CardPanel {panel} open={openOnce} {clock} {newId} onchange={() => void page.load()} />
</div>

<style>
	.owed-main {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
		min-inline-size: 0;
	}
</style>
