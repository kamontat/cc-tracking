<script lang="ts">
	import type { Card, CardPayment } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import CardPanel from "#components/organisms/CardPanel.svelte"
	import ListPanel from "#components/organisms/ListPanel.svelte"
	import NeedsYou from "#components/organisms/NeedsYou.svelte"
	import { today } from "#lib/domain/date"
	import { needsYou } from "#lib/domain/home"
	import { plannedOf } from "#lib/domain/pay"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { NEEDS_ADDRESS } from "#lib/ui/home-query"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { RecordPanel } from "#lib/ui/record-panel.svelte"
	import { deletePlannedPayment, markPlanPaid } from "#lib/ui/row-actions"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * Home's _Needs you_ tab (`/`, RD-22): every row that needs the reader, money at risk first
	 * (DD-62). A plan's buttons write the same calls, with the same errors, as Transactions; each
	 * write reloads, so a done item goes and a failed one stays under the banner. A waiting list's
	 * or a draft's row opens the list's panel over Home (`?list=<id>`, `ListPanel`, which holds its
	 * actions); an overdue bill's _Open card_ opens the card's panel (`?card=<id>`, `CardPanel`,
	 * which wins when both keys are there), and its _Pay_ the card's panel straight on its pay form
	 * with the amount left filled in, whose save, _Cancel_ and ‹ swap the card back in place
	 * (RD-24). A write in a panel reads Needs you again.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** The page's only clock reading: today's date. */
		clock?: () => Date
		/** How often the page re-reads the clock, so a tab left open past midnight moves on. */
		tickMs?: number
		/** The address bar; tests pass one that records and plays Back and Forward. */
		address?: AddressBar
		/** Makes a payment's id, in the card's panel. */
		newId?: () => string
	}

	const {
		open = () => openRepository(),
		clock = () => new Date(),
		tickMs = 60_000,
		address = browserBar(),
		newId = () => crypto.randomUUID(),
	}: Props = $props()

	/** The store, opened once for the page and its panels. */
	let opening: Promise<Opened> | null = null
	const openOnce = () => {
		opening ??= open()
		return opening
	}

	/** The open list, or a bill's card, in the address and history (RD-23). */
	const panel = new RecordPanel({ address, path: NEEDS_ADDRESS, kinds: ["card", "list"] })

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
	/** _Pay_ on a bill: the card's panel straight on its pay form, `amount` satang filled in. */
	const pay = (card: Card, amount: number) =>
		panel.show({ kind: "card", id: card.id }, { name: "pay", arg: `${amount}` })

	const items = $derived(data ? needsYou(data, now, plannedOf(data.payments)) : [])

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		const stopPanel = panel.start()
		// Re-reads the clock now and then, so a tab left open past midnight moves on to the new
		// day. A new day reloads, since every ledger is worked out against today.
		const timer = setInterval(() => {
			const next = today(clock())
			if (next === now) return
			now = next
			void page.load()
		}, tickMs)
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
			clearInterval(timer)
			unsubscribe()
			stopPanel()
		}
	})
</script>

<div class="panel-layout" data-panel={panel.open ? "" : undefined}>
	<div class="needs-main">
		<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
		<NeedsYou
			{items}
			cards={data?.cards ?? []}
			groups={data?.groups ?? []}
			owners={data?.owners ?? []}
			today={now}
			current={panel.record?.kind === "list" ? panel.record.id : null}
			onmarkpaid={mark}
			ondeletepayment={removePlan}
			onopenlist={(list) => panel.show({ kind: "list", id: list.id })}
			onopencard={(id) => panel.show({ kind: "card", id })}
			onpay={pay} />
	</div>
	<ListPanel {panel} open={openOnce} {clock} onchange={() => void page.load()} />
	<CardPanel {panel} open={openOnce} {clock} {newId} onchange={() => void page.load()} />
</div>

<style>
	.needs-main {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
		min-inline-size: 0;
	}
</style>
