import "#legacy/components/cc-error-banner"
import "#legacy/components/cc-modal"
import "#legacy/components/cc-pay-form"
import "#legacy/components/cc-pay-picker"
import type { PayDetail } from "#legacy/components/cc-pay-form"
import type { PickDetail } from "#legacy/components/cc-pay-picker"
import type { CardPayment } from "#lib/domain/types"
import type { Repository } from "#lib/storage/repository"

import { html, nothing, render } from "lit"

import { subHeader } from "#legacy/lib/ui/sub-header"
import { today } from "#lib/domain/date"
import { formatAmountInput } from "#lib/domain/money"
import { payChoices, payFigures } from "#lib/domain/pay"
import { type GroupRoom, groupRoom } from "#lib/domain/room"
import { subscribe, t } from "#lib/i18n/index"
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data"
import { createPageState } from "#lib/ui/page-state"
import { payAddress, readPayAddress } from "#lib/ui/pay-address"
import { savePayment } from "#lib/ui/record-payment"
import { pageSignal } from "#lib/ui/spa"
import { banner } from "./list/common"

/** The address bar as the payment page uses it; the browser's own unless a test passes one. */
export type PayAddressBar = {
	/** The address's query as it stands now. */
	search: () => string
	/** Adds an entry (`history.pushState`): picking a card, so Back closes its sheet. */
	push: (url: string) => void
	/** Rewrites this entry (`history.replaceState`): closing the sheet. */
	replace: (url: string) => void
	/** Runs `listener` when Back or Forward moves between this page's entries. */
	onPop: (listener: () => void) => void
	/** How many entries the session holds, for the back control. */
	length: () => number
	/** One entry back, for the back control. */
	back: () => void
}

/** The browser's own address bar, as the payment page uses it. */
export const browserBar = (): PayAddressBar => ({
	search: () => location.search,
	push: (url) => history.pushState(null, "", url),
	replace: (url) => history.replaceState(history.state, "", url),
	onPop: (listener) => addEventListener("popstate", listener, { signal: pageSignal() }),
	length: () => history.length,
	back: () => history.back(),
})

export type PayPageOptions = {
	/** Today's date, read once. */
	clock?: () => Date
	address?: PayAddressBar
	/** Leaves for another page after a save; `location.replace`, so Back does not reopen the sheet. */
	navigate?: (url: string) => void
}

/**
 * The payment page (DD-76). `/pay` is the card picker, a full page under a sub-header.
 * `/pay?card=<id>` shows the picker with the payment sheet risen over it, the amount
 * prefilled from `&amount=<satang>` or else the card's next bill. Picking a card pushes its
 * address, so Back closes the sheet; closing the sheet (Close, Escape, the backdrop, *Change*)
 * steps back over that pushed entry, or rewrites the address without the card when the page
 * was opened at `?card=` directly. A save leaves for Transactions by replacing this
 * page in history; a failed one keeps the sheet and what was typed, with the reason. When
 * Back took the sheet away while the save was held, the reason shows in the page banner
 * instead, whose *Try again* reopens that card's sheet on what was typed.
 */
export function renderPayPage(repo: Repository, root: HTMLElement, options: PayPageOptions = {}): void {
	const now = today((options.clock ?? (() => new Date()))())
	const address = options.address ?? browserBar()
	const navigate = options.navigate ?? ((url: string) => location.replace(url))

	let data: MoneyData | null = null
	// Each group's room, by group id, for the picker's rails: as Cards counts it.
	let rooms = new Map<string, GroupRoom>()
	let busy = false
	// A failed save's reason shows in the sheet it failed in, and goes when that sheet closes.
	let saveFailed = false
	// Whether this page pushed the entry now showing (a pick, or Forward onto one): closing its
	// sheet then steps back, so the picker is not in history twice. An address opened as it is
	// (a link to `?card=`) is rewritten instead, since there is nothing of ours behind it.
	let pushed = false
	let pickedOnce = false
	// A save that failed after its sheet had gone (Back while it was held): its card and what
	// was typed, for the page banner's *Try again*.
	let orphan: { cardId: string; detail: PayDetail } | null = null
	// What *Try again* types back into the sheet it reopens.
	let kept: { cardId: string; detail: PayDetail } | null = null
	const sheetHost = root.ownerDocument.createElement("div")
	sheetHost.id = "pay-sheet"

	const state = createPageState({
		fetch: async () => {
			const money = await loadMoneyData(repo, now)
			rooms = new Map(
				money.groups.map((group) => [group.id, groupRoom(group, money.cards, money.ledgers, money.lists, "")]),
			)
			data = money
		},
		fallbackKey: "pay.error.read",
		paint: () => paint(),
	})

	/** Lets a failed save's reason go, from the sheet or the page banner. */
	const forget = () => {
		if (saveFailed || orphan) state.clear()
		saveFailed = false
		orphan = null
	}

	const close = () => {
		if (busy) return
		forget()
		kept = null
		if (pushed) {
			pushed = false
			// The pop that follows repaints without the card.
			address.back()
			return
		}
		address.replace(payAddress())
		paint()
	}

	const save = async (cardId: string, detail: PayDetail) => {
		if (!data || busy) return
		busy = true
		paint()
		const note = detail.note?.trim()
		const payment: CardPayment = {
			id: crypto.randomUUID(),
			cardId,
			date: detail.date,
			amount: detail.amount,
			status: detail.date > now ? "planned" : "paid",
			...(note ? { note } : {}),
		}
		const loaded = data
		let saved = false
		await state.guard(async () => {
			await savePayment(repo, loaded, payment, now)
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
		paint()
	}

	/** Opens a card's sheet as a pick does: a pushed entry, so Back closes it. */
	const open = (cardId: string) => {
		pushed = true
		pickedOnce = true
		address.push(payAddress({ cardId }))
		paint()
	}

	/** The page banner's *Try again*: reopens the failed save's sheet on what was typed. */
	const retry = () => {
		if (!orphan) return
		kept = orphan
		forget()
		open(kept.cardId)
	}

	const sheet = (loaded: MoneyData, cardId: string, amount?: number) => {
		const card = loaded.cards.find((c) => c.id === cardId)
		const ledger = card ? loaded.ledgers.get(card.id) : undefined
		if (!card || !ledger) return nothing
		const figures = payFigures(ledger, now)
		const typed = kept?.cardId === card.id ? kept.detail : undefined
		const start = typed?.amount ?? amount ?? (figures.nextBill > 0 ? figures.nextBill : null)
		return html`<cc-modal sheet data-sheet="pay" heading=${t("pay.title")}
			.held=${busy} @close=${close}>
			<cc-pay-form
				.card=${card}
				.groups=${loaded.groups}
				.figures=${figures}
				.today=${now}
				.amount=${start === null ? "" : formatAmountInput(start)}
				.startDate=${typed?.date ?? ""}
				.startNote=${typed?.note ?? ""}
				.error=${saveFailed ? state.error : ""}
				.busy=${busy}
				@pay=${(event: CustomEvent<PayDetail>) => void save(card.id, event.detail)}
				@change=${(event: Event) => {
					// *Change* slides the sheet away as Close does, then goes back to the picker.
					const modal = (event.currentTarget as HTMLElement).closest("cc-modal")
					if (modal && !busy) modal.leave(close)
					else close()
				}}
			></cc-pay-form>
		</cc-modal>`
	}

	const paint = () => {
		const { cardId, amount } = readPayAddress(address.search())
		const header = subHeader({
			title: t("pay.title"),
			back: () => (address.length() > 1 ? address.back() : navigate("/transactions")),
		})
		if (!data) {
			render(html`${header}${banner(state)}`, root)
			render(nothing, sheetHost)
			return
		}
		const known = cardId ? data.cards.some((c) => c.id === cardId) : false
		render(
			html`${header}${
				orphan
					? html`<cc-error-banner .message=${state.error}
							@retry=${retry}></cc-error-banner>`
					: saveFailed
						? nothing
						: banner(state)
			}
				${cardId && !known ? html`<p class="placeholder" data-missing>${t("pay.missing")}</p>` : nothing}
				<cc-pay-picker
					.choices=${payChoices(data.cards, data.ledgers, now)}
					.groups=${data.groups}
					.rooms=${rooms}
					.ledgers=${data.ledgers}
					.today=${now}
					.total=${data.cards.length}
					@pick=${(event: CustomEvent<PickDetail>) => {
						forget()
						kept = null
						open(event.detail.cardId)
					}}
				></cc-pay-picker>`,
			root,
		)
		// The sheet lives outside the page's root, so painting the picker never re-creates it.
		if (!sheetHost.isConnected) root.after(sheetHost)
		render(known && cardId ? sheet(data, cardId, amount) : nothing, sheetHost)
	}

	address.onPop(() => {
		// Even while a save is held, so the page knows which entry it is on when the save ends.
		forget()
		kept = null
		// Back onto the picker, or Forward onto a card entry only a pick could have made.
		pushed = pickedOnce && readPayAddress(address.search()).cardId !== undefined
		paint()
	})
	subscribe(() => paint(), { signal: pageSignal() })
	void state.load()
}
