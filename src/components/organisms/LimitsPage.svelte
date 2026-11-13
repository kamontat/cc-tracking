<script lang="ts">
	import type { CardsRooms, GroupPanel } from "#lib/domain/cards-view"
	import type { LimitsView } from "#lib/domain/limits-view"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { SheetTab } from "#lib/ui/sheet-tab"
	import type { Opened } from "#lib/ui/startup"

	import { onMount, untrack } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import FilterControls from "#components/molecules/FilterControls.svelte"
	import CardPanel from "#components/organisms/CardPanel.svelte"
	import GroupPanels from "#components/organisms/GroupPanels.svelte"
	import LimitPanel from "#components/organisms/LimitPanel.svelte"
	import LimitsFilter from "#components/organisms/LimitsFilter.svelte"
	import { groupPanels } from "#lib/domain/cards-view"
	import { today } from "#lib/domain/date"
	import { limitsResults } from "#lib/domain/limits-view"
	import { ownerName } from "#lib/domain/owner"
	import { groupRoom } from "#lib/domain/room"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { LIMITS_ADDRESS, readLimitsView, writeLimitsView } from "#lib/ui/cards-query"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { RecordPanel } from "#lib/ui/record-panel.svelte"
	import { sortOrderLabel } from "#lib/ui/sort-label"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The Limits tab's island (`/cards/limits`, PRD RD-22): the search row (search, *Filter*, the
	 * sort chip and *+ Add limit* at its end), the filter chips, and a panel per limit group. The
	 * list's settings live in the address (`?q=&f.owners=&sort=&dir=`, RD-29), rewritten in place as
	 * they change. A group opens in its limit panel (`?limit=<id>`, `LimitPanel`), beside the list
	 * from 900px and over it below; a group's card opens the card's panel a step deeper
	 * (`?card=<id>`, `CardPanel`, which wins when both keys are there). *+ Add limit* opens a blank
	 * group form there with the address unchanged. Every address the page writes keeps the open
	 * record (`panel.keep`); a write in a panel reads the list again.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once. */
		clock?: () => Date
		/** The address bar; tests pass one that records and plays Back and Forward. */
		address?: AddressBar
		/** Makes a new group's id. */
		newId?: () => string
	}

	const {
		open = () => openRepository(),
		clock = () => new Date(),
		address = browserBar(),
		newId = () => crypto.randomUUID(),
	}: Props = $props()

	/** The store, opened once for the page and its panels. */
	let opening: Promise<Opened> | null = null
	const openOnce = () => {
		opening ??= open()
		return opening
	}

	/** The open group, or a group's card, in the address and history (RD-23). */
	const panel = untrack(() => new RecordPanel({ address, path: LIMITS_ADDRESS, kinds: ["card", "limit"] }))

	type LimitsData = { money: MoneyData; panels: GroupPanel[] }

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = untrack(() => today(clock()))
	let repo: Repository | null = null
	let data = $state.raw<LimitsData | null>(null)
	let view = $state.raw<LimitsView>(untrack(() => readLimitsView(address.search())))
	let filterOpen = $state(false)
	let sheetTab = $state<SheetTab>("filter")
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)

	const ownerIds = (money: MoneyData) => money.owners.map((record) => record.id)

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			const money = await loadMoneyData(repo, now)
			const rooms: CardsRooms = new Map(
				money.groups.map((group) => [group.id, groupRoom(group, money.cards, money.ledgers, money.lists, "")]),
			)
			view = readLimitsView(address.search(), ownerIds(money))
			data = { money, panels: groupPanels(money.groups, money.cards, rooms) }
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

	const change = (next: Partial<LimitsView>) => {
		view = { ...view, ...next }
		address.replace(panel.keep(`${LIMITS_ADDRESS}${writeLimitsView(view)}`))
	}

	const chips = $derived(
		view.owners.map((owner) => ({
			key: `owner:${owner}`,
			label: ownerName(owner, data?.money.owners),
			clear: () => change({ owners: view.owners.filter((o) => o !== owner) }),
		})),
	)

	const results = $derived(data ? limitsResults(data.panels, data.money.cards, view) : [])

	const countFor = (draft: LimitsView) => (data ? limitsResults(data.panels, data.money.cards, draft).length : 0)

	const sortLabel = $derived.by(() => {
		void lang
		return sortOrderLabel(view.sort, view.dir)
	})

	const emptyText = $derived.by(() => {
		void lang
		return t(data && data.panels.length > 0 ? "limits.page.noMatch" : "limits.page.empty")
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
			view = readLimitsView(address.search(), data ? ownerIds(data.money) : undefined)
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
	<div class="limits-main">
		<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
		{#if data}
			<FilterControls
				q={view.q}
				placeholder={tr("limits.page.search")}
				onsearch={(q: string) => change({ q })}
				onopen={(tab: SheetTab) => {
					sheetTab = tab
					filterOpen = true
				}}
				count={chips.length}
				sort={sortLabel}
				{chips}>
				{#snippet end()}
					<button
						type="button"
						class="tx-fbtn"
						data-variant="quiet"
						data-action="add-limit"
						onclick={() => panel.blank("limit")}>
						<SvgIcon name="plus" />{tr("limits.page.add")}
					</button>
				{/snippet}
			</FilterControls>
			<GroupPanels
				panels={results}
				owners={data.money.owners}
				empty={emptyText}
				current={panel.record?.kind === "limit" ? panel.record.id : null}
				onopengroup={(id: string) => panel.show({ kind: "limit", id })} />
			{#if filterOpen}
				<LimitsFilter
					tab={sheetTab}
					view={{ ...view }}
					owners={data.money.owners}
					count={countFor}
					onapply={(next: LimitsView) => {
						filterOpen = false
						change({ ...next })
					}}
					onclose={() => {
						filterOpen = false
					}} />
			{/if}
		{/if}
	</div>
	<LimitPanel {panel} open={openOnce} {clock} {newId} onchange={() => void page.load()} />
	<CardPanel {panel} open={openOnce} {clock} onchange={() => void page.load()} />
</div>

<style>
	.limits-main {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
		min-inline-size: 0;
	}
</style>
