<script lang="ts">
	import type { CardPayment } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { PayDetail } from "#lib/ui/pay-form"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import Sheet from "#components/molecules/Sheet.svelte"
	import SubHeaderBar from "#components/molecules/SubHeaderBar.svelte"
	import PayForm from "#components/organisms/PayForm.svelte"
	import PayPicker from "#components/organisms/PayPicker.svelte"
	import { today } from "#lib/domain/date"
	import { formatAmountInput } from "#lib/domain/money"
	import { payChoices, payFigures } from "#lib/domain/pay"
	import { type GroupRoom, groupRoom } from "#lib/domain/room"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { createPageState } from "#lib/ui/page-state"
	import { payAddress, readPayAddress } from "#lib/ui/pay-address"
	import { savePayment } from "#lib/ui/record-payment"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The payment page's island (DD-76). `/pay` is the card picker, a full page under a
	 * sub-header. `/pay?card=<id>` shows the picker with the payment sheet risen over it, the
	 * amount prefilled from `&amount=<satang>` or else the card's next bill. Picking a card pushes
	 * its address, so Back closes the sheet; closing the sheet (Close, Escape, the backdrop,
	 * *Change*) steps back over that pushed entry, or rewrites the address without the card when
	 * the page was opened at `?card=` directly. A save leaves for Transactions by replacing this
	 * page in history; a failed one keeps the sheet and what was typed, with the reason. When Back
	 * took the sheet away while the save was held, the reason shows in the page banner instead,
	 * whose *Try again* reopens that card's sheet on what was typed.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once. */
		clock?: () => Date
		/** The address bar; tests pass one that records and plays Back and Forward. */
		address?: AddressBar
		/** Leaves for another page after a save; `location.replace`, so Back does not reopen the sheet. */
		navigate?: (url: string) => void
		/** Makes a payment's id. */
		newId?: () => string
	}

	const {
		open: openStore = () => openRepository(),
		clock = () => new Date(),
		address = browserBar(),
		navigate = (url: string) => location.replace(url),
		newId = () => crypto.randomUUID(),
	}: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = today(clock())
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	// Each group's room, by group id, for the picker's rails: as Cards counts it.
	let rooms = $state.raw(new Map<string, GroupRoom>())
	/** What the address asks for: a card's sheet, and the amount to start it on. */
	let wanted = $state(readPayAddress(address.search()))
	let busy = $state(false)
	// A failed save's reason shows in the sheet it failed in, and goes when that sheet closes.
	let saveFailed = $state(false)
	// A save that failed after its sheet had gone (Back while it was held): its card and what was
	// typed, for the page banner's *Try again*.
	let orphan = $state.raw<{ cardId: string; detail: PayDetail } | null>(null)
	// What *Try again* types back into the sheet it reopens.
	let kept = $state.raw<{ cardId: string; detail: PayDetail } | null>(null)
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)
	// Whether this page pushed the entry now showing (a pick, or Forward onto one): closing its
	// sheet then steps back, so the picker is not in history twice. An address opened as it is (a
	// link to `?card=`) is rewritten instead, since there is nothing of ours behind it.
	let pushed = false
	let pickedOnce = false
	let sheet = $state<ReturnType<typeof Sheet> | undefined>()

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			const money = await loadMoneyData(repo, now)
			rooms = new Map(
				money.groups.map((group) => [group.id, groupRoom(group, money.cards, money.ledgers, money.lists, "")]),
			)
			data = money
		},
		fallbackKey: "pay.error.read",
		paint: () => {
			painted++
		},
	})

	const error = $derived.by(() => {
		void lang
		void painted
		return startupFailure ? startupFailure() : page.error
	})

	/** Lets a failed save's reason go, from the sheet or the page banner. */
	const forget = () => {
		if (saveFailed || orphan) page.clear()
		saveFailed = false
		orphan = null
		painted++
	}

	const close = () => {
		if (busy) return
		forget()
		kept = null
		if (pushed) {
			pushed = false
			// The pop that follows reads the address without the card.
			address.back()
			return
		}
		address.replace(payAddress())
		wanted = readPayAddress(address.search())
	}

	const save = async (cardId: string, detail: PayDetail) => {
		const store = repo
		const loaded = data
		if (!store || !loaded || busy) return
		busy = true
		const note = detail.note?.trim()
		const payment: CardPayment = {
			id: newId(),
			cardId,
			date: detail.date,
			amount: detail.amount,
			status: detail.date > now ? "planned" : "paid",
			...(note ? { note } : {}),
		}
		let saved = false
		await page.guard(async () => {
			await savePayment(store, loaded, payment, now)
			saved = true
		}, "pay.error.save")
		if (saved) {
			navigate("/transactions")
			return
		}
		busy = false
		// Back while the save was held took its sheet away: the page banner says why instead.
		if (readPayAddress(address.search()).cardId === cardId) saveFailed = true
		else orphan = { cardId, detail }
	}

	/** Opens a card's sheet as a pick does: a pushed entry, so Back closes it. */
	const openCard = (cardId: string) => {
		pushed = true
		pickedOnce = true
		address.push(payAddress({ cardId }))
		wanted = readPayAddress(address.search())
	}

	/** The page banner's *Try again*: reopens the failed save's sheet on what was typed. */
	const retry = () => {
		if (!orphan) return
		kept = orphan
		forget()
		openCard(kept.cardId)
	}

	const onBack = () => (address.length() > 1 ? address.back() : navigate("/transactions"))

	const known = $derived(wanted.cardId && data ? data.cards.some((c) => c.id === wanted.cardId) : false)

	/** The open sheet's card, ledger and starting values; null when no known card is asked for. */
	const opened = $derived.by(() => {
		if (!data || !wanted.cardId) return null
		const card = data.cards.find((c) => c.id === wanted.cardId)
		const ledger = card ? data.ledgers.get(card.id) : undefined
		if (!card || !ledger) return null
		const figures = payFigures(ledger, now)
		const typed = kept?.cardId === card.id ? kept.detail : undefined
		const start = typed?.amount ?? wanted.amount ?? (figures.nextBill > 0 ? figures.nextBill : null)
		return {
			card,
			figures,
			amount: start === null ? "" : formatAmountInput(start),
			startDate: typed?.date ?? "",
			startNote: typed?.note ?? "",
		}
	})

	const choices = $derived(data ? payChoices(data.cards, data.ledgers, now) : [])

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		const removePop = address.onPop(() => {
			// Even while a save is held, so the page knows which entry it is on when the save ends.
			forget()
			kept = null
			wanted = readPayAddress(address.search())
			// Back onto the picker, or Forward onto a card entry only a pick could have made.
			pushed = pickedOnce && wanted.cardId !== undefined
		})
		void (async () => {
			const result = await openStore()
			if (!result.ok) {
				startupFailure = result.message
				return
			}
			repo = result.repo
			await page.load()
		})()
		return () => {
			unsubscribe()
			removePop()
		}
	})
</script>

<SubHeaderBar title={tr("pay.title")} back={onBack} />
{#if orphan}
	<ErrorBanner message={error} retryLabel={tr("common.retry")} onretry={retry} />
{:else if !saveFailed}
	<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
{/if}
{#if data}
	{#if wanted.cardId && !known}
		<p class="placeholder" data-missing>{tr("pay.missing")}</p>
	{/if}
	<PayPicker
		{choices}
		groups={data.groups}
		{rooms}
		ledgers={data.ledgers}
		today={now}
		total={data.cards.length}
		onpick={({ cardId }) => {
			forget()
			kept = null
			openCard(cardId)
		}} />
	{#if opened}
		{@const current = opened}
		{#key current.card.id}
			<Sheet bind:this={sheet} heading={tr("pay.title")} held={busy} onclose={close}>
				<PayForm
					card={current.card}
					groups={data.groups}
					figures={current.figures}
					today={now}
					amount={current.amount}
					startDate={current.startDate}
					startNote={current.startNote}
					error={saveFailed ? error : ""}
					{busy}
					onpay={(detail: PayDetail) => void save(current.card.id, detail)}
					onchange={() => {
						// *Change* slides the sheet away as Close does, then goes back to the picker.
						if (sheet && !busy) sheet.leave(close)
						else close()
					}} />
			</Sheet>
		{/key}
	{/if}
{/if}
