import "#components/cc-error-banner";
import "#components/cc-pay-form";
import "#components/cc-pay-picker";
import { html, nothing, render } from "lit";
import { today } from "#lib/domain/date";
import { formatAmountInput } from "#lib/domain/money";
import { payChoices, payFigures } from "#lib/domain/pay";
import type { CardPayment } from "#lib/domain/types";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { backHeader } from "#lib/ui/back-header";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { createPageState } from "#lib/ui/page-state";
import { savePayment } from "#lib/ui/record-payment";
import {
	banner,
	type ListPageOptions,
	listPageDefaults,
	markListPage,
} from "./list/common";

export type PayPageOptions = ListPageOptions & {
	/** How many pages the session holds; `history.length` unless a test passes its own. */
	historyLength?: () => number;
	/** Steps back one page; `history.back()` unless a test records it instead. */
	goBack?: () => void;
};

/**
 * Renders the payment pages into `root`. Without a known `card` in the address it asks which
 * card (an unknown id says so first); with one it shows the form, the amount prefilled from
 * `amount` (satang). A save goes to Transactions by replacing this page in history.
 */
export function renderPayPage(
	repo: Repository,
	root: HTMLElement,
	options: PayPageOptions = {},
): void {
	const { clock, search, navigate } = listPageDefaults(options);
	const historyLength = options.historyLength ?? (() => history.length);
	const goBack = options.goBack ?? (() => history.back());
	markListPage(root);
	const now = today(clock());
	const params = new URLSearchParams(search);
	const cardId = params.get("card");
	const prefill = params.get("amount");
	const initial = prefill && /^\d+$/.test(prefill) ? Number(prefill) : null;
	let data: MoneyData | null = null;

	const state = createPageState({
		fetch: async () => {
			data = await loadMoneyData(repo, now);
		},
		fallbackKey: "pay.error.read",
		paint: () => paint(),
	});

	let busy = false;
	const save = async (detail: { amount: number; date: string }) => {
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
		if (saved) navigate("/transactions");
		else {
			busy = false;
			paint();
		}
	};

	const paint = () => {
		const header = backHeader({
			title: t("pay.title"),
			back: () => (historyLength() > 1 ? goBack() : navigate("/transactions")),
		});
		if (!data) {
			render(html`${header}${banner(state)}`, root);
			return;
		}
		const card = data.cards.find((c) => c.id === cardId);
		const ledger = card ? data.ledgers.get(card.id) : undefined;
		if (card && ledger) {
			render(
				html`${header}
					<cc-pay-form
						.card=${card}
						.figures=${payFigures(ledger, now)}
						.today=${now}
						.amount=${initial === null ? "" : formatAmountInput(initial)}
						.error=${state.error}
						.busy=${busy}
						@pay=${(event: CustomEvent<{ amount: number; date: string }>) =>
							void save(event.detail)}
					></cc-pay-form>`,
				root,
			);
			return;
		}
		render(
			html`${header}${banner(state)}
				<h2>${t("pay.which")}</h2>
				${cardId ? html`<p class="placeholder" data-missing>${t("pay.missing")}</p>` : nothing}
				<cc-pay-picker
					.choices=${payChoices(data.cards, data.ledgers, now)}
					.today=${now}
				></cc-pay-picker>`,
			root,
		);
	};

	subscribe(() => paint());
	void state.load();
}
