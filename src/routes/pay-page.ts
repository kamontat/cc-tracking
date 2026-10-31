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
import type { CardPayment } from "#lib/domain/types";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { backHeader } from "#lib/ui/back-header";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { createPageState } from "#lib/ui/page-state";
import { payAddress, readPayAddress } from "#lib/ui/pay-address";
import { savePayment } from "#lib/ui/record-payment";
import { banner } from "./list/common";

/** The address bar as the payment page uses it; the browser's own unless a test passes one. */
export type PayAddressBar = {
	/** The address's query as it stands now. */
	search: () => string;
	/** Adds an entry (`history.pushState`): picking a card, so Back closes its sheet. */
	push: (url: string) => void;
	/** Rewrites this entry (`history.replaceState`): closing the sheet. */
	replace: (url: string) => void;
	/** Runs `listener` when Back or Forward moves between this page's entries. */
	onPop: (listener: () => void) => void;
	/** How many entries the session holds, for the back control. */
	length: () => number;
	/** One entry back, for the back control. */
	back: () => void;
};

const browserBar = (): PayAddressBar => ({
	search: () => location.search,
	push: (url) => history.pushState(null, "", url),
	replace: (url) => history.replaceState(null, "", url),
	onPop: (listener) => addEventListener("popstate", listener),
	length: () => history.length,
	back: () => history.back(),
});

export type PayPageOptions = {
	/** Today's date, read once. */
	clock?: () => Date;
	address?: PayAddressBar;
	/** Leaves for another page after a save; `location.replace`, so Back does not reopen the sheet. */
	navigate?: (url: string) => void;
};

/**
 * Marks `<html data-pay-page>`, so the shell hides the floating Payment button here: the page
 * is where the button leads.
 */
const markPayPage = (root: HTMLElement): void => {
	root.ownerDocument.documentElement.setAttribute("data-pay-page", "");
};

/**
 * The payment page (DD-76). `/pay` is the card picker, a full page under a back header.
 * `/pay?card=<id>` shows the picker with the payment sheet risen over it, the amount
 * prefilled from `&amount=<satang>` or else the card's next bill. Picking a card pushes its
 * address, so Back closes the sheet; closing the sheet (Close, Escape, the backdrop, *Change*)
 * steps back over that pushed entry, or rewrites the address without the card when the page
 * was opened at `?card=` directly. A save leaves for Transactions by replacing this
 * page in history; a failed one keeps the sheet and what was typed, with the reason.
 */
export function renderPayPage(
	repo: Repository,
	root: HTMLElement,
	options: PayPageOptions = {},
): void {
	const now = today((options.clock ?? (() => new Date()))());
	const address = options.address ?? browserBar();
	const navigate = options.navigate ?? ((url: string) => location.replace(url));
	markPayPage(root);

	let data: MoneyData | null = null;
	let busy = false;
	// A failed save's reason shows in the sheet it failed in, and goes when that sheet closes.
	let saveFailed = false;
	// Whether this page pushed the entry now showing (a pick, or Forward onto one): closing its
	// sheet then steps back, so the picker is not in history twice. An address opened as it is
	// (a link to `?card=`) is rewritten instead, since there is nothing of ours behind it.
	let pushed = false;
	let pickedOnce = false;
	const sheetHost = root.ownerDocument.createElement("div");
	sheetHost.id = "pay-sheet";

	const state = createPageState({
		fetch: async () => {
			data = await loadMoneyData(repo, now);
		},
		fallbackKey: "pay.error.read",
		paint: () => paint(),
	});

	const close = () => {
		if (busy) return;
		saveFailed = false;
		if (pushed) {
			pushed = false;
			// The pop that follows repaints without the card.
			address.back();
			return;
		}
		address.replace(payAddress());
		paint();
	};

	const save = async (cardId: string, detail: PayDetail) => {
		if (!data || busy) return;
		busy = true;
		paint();
		const note = detail.note?.trim();
		const payment: CardPayment = {
			id: crypto.randomUUID(),
			cardId,
			date: detail.date,
			amount: detail.amount,
			status: detail.date > now ? "planned" : "paid",
			...(note ? { note } : {}),
		};
		const loaded = data;
		let saved = false;
		await state.guard(async () => {
			await savePayment(repo, loaded, payment, now);
			saved = true;
		}, "pay.error.save");
		if (saved) {
			navigate("/transactions");
			return;
		}
		saveFailed = true;
		busy = false;
		paint();
	};

	const sheet = (loaded: MoneyData, cardId: string, amount?: number) => {
		const card = loaded.cards.find((c) => c.id === cardId);
		const ledger = card ? loaded.ledgers.get(card.id) : undefined;
		if (!card || !ledger) return nothing;
		const figures = payFigures(ledger, now);
		const start = amount ?? (figures.nextBill > 0 ? figures.nextBill : null);
		return html`<cc-modal sheet data-sheet="pay" heading=${t("pay.title")} @close=${close}>
			<cc-pay-form
				.card=${card}
				.groups=${loaded.groups}
				.figures=${figures}
				.today=${now}
				.amount=${start === null ? "" : formatAmountInput(start)}
				.error=${saveFailed ? state.error : ""}
				.busy=${busy}
				@pay=${(event: CustomEvent<PayDetail>) => void save(card.id, event.detail)}
				@change=${close}
			></cc-pay-form>
		</cc-modal>`;
	};

	const paint = () => {
		const { cardId, amount } = readPayAddress(address.search());
		const header = backHeader({
			title: t("pay.title"),
			back: () =>
				address.length() > 1 ? address.back() : navigate("/transactions"),
		});
		if (!data) {
			render(html`${header}${banner(state)}`, root);
			render(nothing, sheetHost);
			return;
		}
		const known = cardId ? data.cards.some((c) => c.id === cardId) : false;
		render(
			html`${header}${saveFailed ? nothing : banner(state)}
				${
					cardId && !known
						? html`<p class="placeholder" data-missing>${t("pay.missing")}</p>`
						: nothing
				}
				<cc-pay-picker
					.choices=${payChoices(data.cards, data.ledgers, now)}
					.groups=${data.groups}
					@pick=${(event: CustomEvent<PickDetail>) => {
						saveFailed = false;
						pushed = true;
						pickedOnce = true;
						address.push(payAddress({ cardId: event.detail.cardId }));
						paint();
					}}
				></cc-pay-picker>`,
			root,
		);
		// The sheet lives outside the page's root, so painting the picker never re-creates it.
		if (!sheetHost.isConnected) root.after(sheetHost);
		render(known && cardId ? sheet(data, cardId, amount) : nothing, sheetHost);
	};

	address.onPop(() => {
		if (busy) return;
		saveFailed = false;
		// Back onto the picker, or Forward onto a card entry only a pick could have made.
		pushed =
			pickedOnce && readPayAddress(address.search()).cardId !== undefined;
		paint();
	});
	subscribe(() => paint());
	void state.load();
}
