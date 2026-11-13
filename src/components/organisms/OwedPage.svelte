<script lang="ts">
	import type { OwedRow } from "#lib/domain/owed"
	import type { SortDir } from "#lib/domain/sort"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import CardPanel from "#components/organisms/CardPanel.svelte"
	import OwedList from "#components/organisms/OwedList.svelte"
	import { today } from "#lib/domain/date"
	import { type OwedSort, owedLeft, owedRows } from "#lib/domain/owed"
	import { groupRoom } from "#lib/domain/room"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { OWED_ADDRESS, type OwedView, readOwedView, writeOwedView } from "#lib/ui/home-query"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { RecordPanel } from "#lib/ui/record-panel.svelte"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * Home's _Owed_ tab (`/owed`, RD-25): every card that owes, as payment tiles, in the order kept
	 * in the address (`?sort=&dir=`, rewritten in place, RD-29). A tile opens the card's panel over
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
	let view = $state.raw<OwedView>(readOwedView(address.search()))
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

	const rooms = $derived(
		data
			? new Map(data.groups.map((group) => [group.id, groupRoom(group, data.cards, data.ledgers, data.lists, "")]))
			: new Map(),
	)
	const rows = $derived(data ? owedRows(data.cards, data.ledgers, now, view.sort, view.dir) : [])

	const sortBy = (sort: OwedSort, dir: SortDir) => {
		view = { sort, dir }
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
			view = readOwedView(address.search())
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
		{#if data}
			<OwedList
				{rows}
				groups={data.groups}
				{rooms}
				ledgers={data.ledgers}
				today={now}
				sort={view.sort}
				dir={view.dir}
				onsort={sortBy}
				current={panel.record?.kind === "card" ? panel.record.id : null}
				onopencard={(id) => panel.show({ kind: "card", id })}
				onpay={pay} />
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
