<script lang="ts">
	import type { CardsRooms, CardsView } from "#lib/domain/cards-view"
	import type { LimitGroup } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import FilterControls from "#components/molecules/FilterControls.svelte"
	import CardsFilter from "#components/organisms/CardsFilter.svelte"
	import CardsList from "#components/organisms/CardsList.svelte"
	import GroupPanels from "#components/organisms/GroupPanels.svelte"
	import GroupSheet from "#components/organisms/GroupSheet.svelte"
	import { cardsResults, groupPanels } from "#lib/domain/cards-view"
	import { today } from "#lib/domain/date"
	import { groupRoom } from "#lib/domain/room"
	import { nameOfLocation, placeOrder } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { takeResetNotice } from "#lib/storage/migrate-locations"
	import { browserBar } from "#lib/ui/address-bar"
	import {
		type CardsShow,
		groupSheetAddress,
		NEW_GROUP,
		readCardsShow,
		readCardsView,
		readGroupSheet,
		writeCardsView,
	} from "#lib/ui/cards-query"
	import { cardsSortLabel } from "#lib/ui/cards-sort"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The Cards page's island (prototype `vCards`): the heading with *Add card*, the shared search,
	 * filter and sort, the results, and *Limit groups* beside them from 900px. The view lives in
	 * the address (`?view=&q=&loc=&owner=&ungrouped=&sort=`), replaced as it changes. Below 900px
	 * a switch beside the title shows the cards or the limit groups (`?view=groups`), and the row
	 * under it holds the shown view's add button. A group opens in a sheet at `?group=<id>`
	 * (`?newGroup=1` for a blank one): tapping a panel pushes that address so Back closes it;
	 * Close steps back over an entry the page pushed, else rewrites the address without the group
	 * (DD-102). A save or delete closes the sheet only once written; a failed one keeps it, and
	 * what was typed, with the reason. Everything here is the reader's data (PRD DD-172).
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
		/** Makes a new group's id. */
		newId?: () => string
	}

	const {
		open = () => openRepository(),
		clock = () => new Date(),
		address = browserBar(),
		storage = globalThis.localStorage,
		newId: makeId = () => crypto.randomUUID(),
	}: Props = $props()

	const SHOWS: readonly CardsShow[] = ["cards", "groups"]

	/** Everything the page draws from, read once per load. */
	type CardsData = { money: MoneyData; rooms: CardsRooms; credits: Map<string, number> }

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = today(clock())
	let repo: Repository | null = null
	let data = $state.raw<CardsData | null>(null)
	// No location is known before the first load, so the address is read again once one lands.
	let view = $state.raw<CardsView>(readCardsView(address.search(), []))
	// Below 900px the page shows the cards or the limit groups, never both.
	let show = $state<CardsShow>(readCardsShow(address.search()))
	/** Which group's sheet the address opens: an id, `NEW_GROUP`, or none. */
	let sheetId = $state(readGroupSheet(address.search()))
	// The filter sheet takes a fresh copy of the view, so its draft starts there.
	let filterOpen = $state(false)
	// Read once per page load: the notice is consumed here, not on every paint.
	let resetNames = $state<string[]>([])
	let busy = $state(false)
	// A failed save's reason shows in the sheet it failed in, and goes when that sheet closes.
	let sheetFailed = $state(false)
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)
	// Whether this page pushed the entry now showing (DD-102).
	let pushed = false
	let openedOnce = false
	// A new group's id, made once when its sheet opens, so a retry after a failed save writes the
	// same record rather than a second one.
	let pendingId: string | null = null

	/** Makes a new group's id when the address opens the blank sheet, and drops it otherwise. */
	const syncNewId = () => {
		pendingId = sheetId === NEW_GROUP ? (pendingId ?? makeId()) : null
	}
	syncNewId()

	const locationIds = (money: MoneyData) => money.locations.map((record) => record.id)

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			const money = await loadMoneyData(repo, now)
			const rooms: CardsRooms = new Map(
				money.groups.map((group) => [group.id, groupRoom(group, money.cards, money.ledgers, money.lists, "")]),
			)
			const credits = new Map(money.cards.map((c) => [c.id, money.ledgers.get(c.id)?.credit ?? 0]))
			view = readCardsView(address.search(), locationIds(money))
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

	const sheetAddress = (group: string | typeof NEW_GROUP | null) =>
		`/cards${groupSheetAddress(writeCardsView(view, show), group)}`

	/** Reads the address after it changed under the page. */
	const readAddress = () => {
		sheetId = readGroupSheet(address.search())
		syncNewId()
	}

	const change = (next: Partial<CardsView>) => {
		view = { ...view, ...next }
		address.replace(sheetAddress(sheetId))
	}

	const choose = (next: CardsShow) => {
		show = next
		address.replace(sheetAddress(sheetId))
	}

	const openSheet = (id: string | typeof NEW_GROUP) => {
		// A write under way closes the sheet it began in; opening another now would let that
		// landing save close the wrong one.
		if (busy) return
		sheetFailed = false
		pushed = true
		openedOnce = true
		address.push(sheetAddress(id))
		readAddress()
	}

	const closeSheet = () => {
		if (busy) return
		sheetFailed = false
		// The failed write's reason belongs to the sheet; it goes when the sheet does.
		page.clear()
		painted++
		if (pushed) {
			pushed = false
			// The pop that follows reads the address without the sheet.
			address.back()
			return
		}
		address.replace(sheetAddress(null))
		readAddress()
	}

	/** Runs a write for the sheet; closes it once written, else keeps it with the reason. */
	const write = async (action: (store: Repository) => Promise<void>, key: MessageKey) => {
		const store = repo
		if (busy || !store) return
		busy = true
		sheetFailed = false
		let done = false
		await page.guard(async () => {
			await action(store)
			done = true
		}, key)
		busy = false
		// Back may have closed the sheet while the write was under way; then there is nothing
		// left to close, and stepping back again would leave the page.
		const stillOpen = readGroupSheet(address.search()) !== null
		if (done) {
			pendingId = null
			if (stillOpen) closeSheet()
			return
		}
		sheetFailed = stillOpen
	}

	const saveGroup = (group: LimitGroup, isNew: boolean) =>
		write(
			(store) => store.saveLimitGroup(isNew && pendingId ? { ...group, id: pendingId } : group),
			"cards.error.saveGroup",
		)

	const deleteGroup = (group: LimitGroup) =>
		write((store) => store.deleteLimitGroup(group.id), "cards.error.deleteGroup")

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
				label: owner,
				clear: () => change({ owners: view.owners.filter((o) => o !== owner) }),
			})),
			...(view.ungrouped
				? [{ key: "ungrouped", label: t("cards.filter.ungrouped"), clear: () => change({ ungrouped: false }) }]
				: []),
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

	const results = $derived(
		data ? cardsResults(data.money.cards, data.money.groups, data.rooms, view, order, now, data.money.ledgers) : null,
	)

	const countFor = (draft: CardsView) =>
		data
			? cardsResults(data.money.cards, data.money.groups, data.rooms, draft, order, now, data.money.ledgers).count
			: 0

	/** The group the address opens, or null for a blank one; undefined when there is none to open. */
	const sheetGroup = $derived.by((): LimitGroup | null | undefined => {
		if (!data || sheetId === null) return undefined
		if (sheetId === NEW_GROUP) return null
		return data.money.groups.find((g) => g.id === sheetId)
	})

	const sortLabel = $derived.by(() => {
		void lang
		return cardsSortLabel(view.sort)
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
		const removePop = address.onPop(() => {
			// Read the new entry even while a write is under way, so the write's close knows what is
			// still open and never steps back past this page.
			sheetFailed = false
			view = readCardsView(address.search(), data ? locationIds(data.money) : [])
			show = readCardsShow(address.search())
			readAddress()
			// Back off a sheet, or Forward onto one only a tap could have made.
			pushed = openedOnce && sheetId !== null
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
		return () => {
			unsubscribe()
			removePop()
		}
	})
</script>

<div class="cards-grid" data-show={show}>
	<div class="cards-main">
		<div class="cards-head">
			<h1>{tr("cards.title")}</h1>
			<fieldset class="tx-switch cards-switch">
				{#each SHOWS as name (name)}
					<button
						type="button"
						data-view={name}
						data-variant="quiet"
						aria-pressed={show === name}
						onclick={() => choose(name)}>
						{tr(`cards.view.${name}`)}
					</button>
				{/each}
			</fieldset>
			<div class="cards-adds">
				<a class="cards-add" data-action="add-card" href="/card/new"><SvgIcon name="plus" />{tr("cards.page.add")}</a>
				{#if show === "groups"}
					<button
						type="button"
						class="cards-add-group"
						data-variant="quiet"
						data-action="add-group"
						onclick={() => openSheet(NEW_GROUP)}>
						<SvgIcon name="plus" />{tr("cards.group.add")}
					</button>
				{/if}
			</div>
		</div>
		{#if !sheetFailed && !busy}
			<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
		{/if}
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
					onopen={() => {
						filterOpen = true
					}}
					count={chips.length}
					sort={sortLabel}
					{chips} />
				<CardsList
					{results}
					groups={data.money.groups}
					rooms={data.rooms}
					credits={data.credits}
					ledgers={data.money.ledgers}
					locations={data.money.locations}
					total={data.money.cards.length}
					today={now} />
				{#if filterOpen}
					<CardsFilter
						view={{ ...view }}
						locations={data.money.locations}
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
	{#if data}
		<aside class="cards-groups">
			<GroupPanels
				panels={groupPanels(data.money.groups, data.money.cards, data.rooms)}
				onopengroup={(id: string) => openSheet(id)}
				onaddgroup={() => openSheet(NEW_GROUP)} />
		</aside>
	{/if}
</div>
{#if data && sheetGroup !== undefined}
	{@const group = sheetGroup}
	<GroupSheet
		{group}
		groups={data.money.groups}
		inUse={group ? data.money.cards.some((c) => c.limitGroupId === group.id) : false}
		error={sheetFailed ? error : ""}
		{busy}
		onsave={(next: LimitGroup) => void saveGroup(next, group === null)}
		ondelete={(next: LimitGroup) => void deleteGroup(next)}
		onclose={closeSheet} />
{/if}

<style>
	/* A fieldset, so the switch is named as a group; app.css draws it, without a fieldset's frame. */
	fieldset.cards-switch {
		min-inline-size: 0;
		margin: 0;
		border: 0;
	}
</style>
