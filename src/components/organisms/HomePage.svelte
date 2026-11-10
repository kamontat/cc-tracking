<script lang="ts">
	import type { CardPayment, PurchaseList } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import NeedsYou from "#components/organisms/NeedsYou.svelte"
	import ReadyPanel from "#components/organisms/ReadyPanel.svelte"
	import { canPurchase } from "#lib/domain/card"
	import { today } from "#lib/domain/date"
	import { needsYou, readyRows } from "#lib/domain/home"
	import { unassignedCards } from "#lib/domain/limit"
	import { plannedOf } from "#lib/domain/pay"
	import { purchasePlaces } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import {
		confirmWaitingList,
		deleteDraftList,
		deletePlannedPayment,
		markPlanPaid,
		mergeSameDayLists,
	} from "#lib/ui/row-actions"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * Home's island: what needs the reader first, then a short *Ready to use* that leads to the
	 * new-list picker (DD-103). From 900px the two sit side by side, *Ready to use* on the left
	 * (DD-152). A *Needs you* row's buttons write the same calls, with the same errors, as
	 * Transactions; each write reloads, so a done item goes and a failed one stays under the banner.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** The page's only clock reading: today's date. */
		clock?: () => Date
		/** How often the page re-reads the clock, so a tab left open past midnight moves on. */
		tickMs?: number
	}

	const { open = () => openRepository(), clock = () => new Date(), tickMs = 60_000 }: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let now = $state(today(clock()))
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
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

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	/** Runs a row's write against the store; a failure shows in the banner under `key`. */
	const write = (action: (store: Repository, money: MoneyData) => Promise<void>, key: MessageKey) => {
		const store = repo
		const money = data
		if (!store || !money) return
		void page.guard(() => action(store, money), key)
	}

	const mark = (payment: CardPayment) =>
		write((store, money) => markPlanPaid(store, money, payment, now), "tx.error.markPaid")
	const removePlan = (payment: CardPayment) => write((store) => deletePlannedPayment(store, payment), "tx.error.delete")
	const confirmList = (list: PurchaseList) =>
		write((store) => confirmWaitingList(store, list.id, clock()), "tx.error.confirmList")
	const removeDraft = (list: PurchaseList) =>
		write((store) => deleteDraftList(store, list.id), "purchaseList.error.delete")
	/** *Merge*: the other same-day lists of its status go into this one (DD-187). */
	const mergeLists = (list: PurchaseList) =>
		write((store) => mergeSameDayLists(store, list.id), "purchaseList.error.merge")

	const items = $derived(data ? needsYou(data, now, plannedOf(data.payments)) : [])
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

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		// Re-reads the clock now and then, so a tab left open past midnight moves on to the new
		// day. A new day reloads, since every ledger is worked out against today.
		const timer = setInterval(() => {
			const next = today(clock())
			if (next === now) return
			now = next
			void page.load()
		}, tickMs)
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
			clearInterval(timer)
			unsubscribe()
		}
	})
</script>

<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
<div class="home-grid">
	<div class="home-needs">
		<NeedsYou
			{items}
			cards={data?.cards ?? []}
			groups={data?.groups ?? []}
			today={now}
			onmarkpaid={mark}
			ondeletepayment={removePlan}
			onconfirmlist={confirmList}
			ondeletedraft={removeDraft}
			onmergelists={mergeLists} />
	</div>
	<div class="home-ready">
		<ReadyPanel {rows} {places} groups={data?.groups ?? []} today={now} {unassigned} />
	</div>
</div>
