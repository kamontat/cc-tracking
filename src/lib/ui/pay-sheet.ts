import "#components/cc-error-banner";
import "#components/cc-modal";
import "#components/cc-pay-form";
import "#components/cc-pay-picker";
import { html, nothing, render } from "lit";
import type { PayDetail } from "#components/cc-pay-form";
import type { PickDetail } from "#components/cc-pay-picker";
import { today } from "#lib/domain/date";
import { formatAmountInput } from "#lib/domain/money";
import { payChoices, payFigures } from "#lib/domain/pay";
import type { CardPayment, PlainDate } from "#lib/domain/types";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { createPageState } from "#lib/ui/page-state";
import { savePayment } from "#lib/ui/record-payment";

/** The event that asks the payment sheet to open, on `document`. */
export const PAY_EVENT = "cc:pay";

/**
 * What to open the sheet on: a card goes straight to its form, else the sheet asks which card.
 * `amount` (satang) prefills the form; without it the form starts at the card's next bill.
 */
export type PayRequest = { cardId?: string; amount?: number };

/**
 * Opens the payment sheet over the current page. Every way to pay -- the floating Payment
 * button, Home's overdue item, a Transactions *Owed* row, the card page's *Make a payment* --
 * goes through here, and the sheet `mountPayHost` put on the page answers.
 */
export function openPayment(
	request: PayRequest = {},
	target: EventTarget = document,
): void {
	target.dispatchEvent(
		new CustomEvent<PayRequest>(PAY_EVENT, { detail: request }),
	);
}

export type PayHostOptions = {
	/** Today's date, read when the sheet opens. */
	clock?: () => Date;
	/** Runs after a save, once the sheet is closed: the page's figures changed under it. */
	reload?: () => void;
	/** Where the sheet listens and is drawn; `document` unless a test passes its own. */
	document?: Document;
};

/**
 * Puts the payment sheet on the page, closed, and opens it on every `cc:pay` event. Opening
 * reads the cards fresh (`loadMoneyData`). A save closes the sheet and reloads the page, so
 * every figure on it includes the payment; a failed save keeps the sheet and what was typed,
 * with the reason above the form. Returns a function that takes the sheet away again.
 */
export function mountPayHost(
	repo: Repository,
	options: PayHostOptions = {},
): () => void {
	const doc = options.document ?? document;
	const clock = options.clock ?? (() => new Date());
	const reload = options.reload ?? (() => location.reload());
	const host = doc.createElement("div");
	host.id = "pay-sheet";
	doc.body.append(host);

	let open = false;
	let now: PlainDate = today(clock());
	let cardId: string | null = null;
	let prefill: number | null = null;
	let data: MoneyData | null = null;
	let busy = false;

	const state = createPageState({
		fetch: async () => {
			data = await loadMoneyData(repo, now);
		},
		fallbackKey: "pay.error.read",
		paint: () => paint(),
	});

	const close = () => {
		if (busy) return;
		open = false;
		paint();
	};

	const save = async (detail: PayDetail) => {
		if (!data || !cardId || busy) return;
		busy = true;
		paint();
		const payment: CardPayment = {
			id: crypto.randomUUID(),
			cardId,
			date: detail.date,
			amount: detail.amount,
			status: detail.date > now ? "planned" : "paid",
		};
		const loaded = data;
		let saved = false;
		await state.guard(async () => {
			await savePayment(repo, loaded, payment, now);
			saved = true;
		}, "pay.error.save");
		busy = false;
		if (saved) {
			open = false;
			paint();
			reload();
		} else paint();
	};

	const body = (loaded: MoneyData) => {
		const card = cardId ? loaded.cards.find((c) => c.id === cardId) : undefined;
		const ledger = card ? loaded.ledgers.get(card.id) : undefined;
		if (card && ledger) {
			const figures = payFigures(ledger, now);
			const start = prefill ?? (figures.nextBill > 0 ? figures.nextBill : null);
			return html`<cc-pay-form
				.card=${card}
				.groups=${loaded.groups}
				.figures=${figures}
				.today=${now}
				.amount=${start === null ? "" : formatAmountInput(start)}
				.error=${state.error}
				.busy=${busy}
				@pay=${(event: CustomEvent<PayDetail>) => void save(event.detail)}
				@change=${() => {
					cardId = null;
					prefill = null;
					paint();
				}}
			></cc-pay-form>`;
		}
		return html`${
			cardId
				? html`<p class="placeholder" data-missing>${t("pay.missing")}</p>`
				: nothing
		}<cc-pay-picker
				.choices=${payChoices(loaded.cards, loaded.ledgers, now)}
				.groups=${loaded.groups}
				@pick=${(event: CustomEvent<PickDetail>) => {
					cardId = event.detail.cardId;
					prefill = null;
					paint();
				}}
			></cc-pay-picker>`;
	};

	const paint = () => {
		if (!open) {
			render(nothing, host);
			return;
		}
		const showBanner = !data || !cardId;
		render(
			html`<cc-modal sheet data-sheet="pay" heading=${t("pay.title")} @close=${close}>
				${
					showBanner
						? html`<cc-error-banner .message=${state.error}
								retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>`
						: nothing
				}
				${data ? body(data) : nothing}
			</cc-modal>`,
			host,
		);
	};

	const onPay = (event: Event) => {
		const request = (event as CustomEvent<PayRequest>).detail ?? {};
		open = true;
		now = today(clock());
		cardId = request.cardId ?? null;
		prefill = request.amount ?? null;
		data = null;
		busy = false;
		paint();
		void state.load();
	};

	doc.addEventListener(PAY_EVENT, onPay);
	const unsubscribe = subscribe(() => paint());
	return () => {
		doc.removeEventListener(PAY_EVENT, onPay);
		unsubscribe();
		render(nothing, host);
		host.remove();
	};
}
