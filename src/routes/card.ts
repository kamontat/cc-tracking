import "@picocss/pico/css/pico.min.css";
import "#components/cc-error-banner";
import "#components/cc-lang-switch";
import "#components/cc-statement-list";
import { html, render } from "lit";
import { today } from "#lib/domain/date";
import { buildStatement, recentPeriods } from "#lib/domain/statement";
import type {
	Card,
	Purchase,
	Statement,
	StatementPayment,
} from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { describeCycleText, locationText } from "#lib/i18n/format";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";

const PAGE_SIZE = 12;

/** Renders the card detail page into `root`, wiring it to `repo`. Exported for tests. */
export function renderCardPage(
	repo: Repository,
	cardId: string | null,
	root: HTMLElement,
): void {
	const now = today();
	let card: Card | null = null;
	let purchases: Purchase[] = [];
	let payments: StatementPayment[] = [];
	let shown = PAGE_SIZE;

	const state = createPageState({
		fetch: async () => {
			if (!cardId) {
				throw new MessageError("card.error.noSelection");
			}
			card = await repo.getCard(cardId);
			if (!card) {
				throw new MessageError("card.error.notFound", { id: cardId });
			}
			purchases = await repo.listPurchases(card.id);
			payments = await repo.listPayments(card.id);
		},
		fallbackKey: "card.error.read",
		paint: () => paint(),
	});

	const statements = (): Statement[] => {
		if (!card) return [];
		const current = card;
		return recentPeriods(current, now, shown).map((period) =>
			buildStatement(
				current,
				period,
				purchases,
				payments.find((payment) => payment.period === period) ?? null,
			),
		);
	};

	const onMarkPaid = (event: CustomEvent<{ cardId: string; period: string }>) =>
		state.guard(async () => {
			const statement = statements().find(
				(s) => s.period === event.detail.period,
			);
			if (!statement) return;
			await repo.savePayment({
				cardId: event.detail.cardId,
				period: event.detail.period,
				paidAt: now,
				closeDate: statement.closeDate,
				dueDate: statement.dueDate,
			});
		}, "card.error.markPaid");

	const onUnmarkPaid = (
		event: CustomEvent<{ cardId: string; period: string }>,
	) =>
		state.guard(
			() => repo.deletePayment(event.detail.cardId, event.detail.period),
			"card.error.unmarkPaid",
		);

	const onDeletePurchase = (
		event: CustomEvent<{ cardId: string; purchaseId: string }>,
	) =>
		state.guard(
			() => repo.deletePurchase(event.detail.cardId, event.detail.purchaseId),
			"card.error.deletePurchase",
		);

	const paint = () =>
		render(
			html`
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				${
					card
						? html`
							<h1>${card.name} <small>••••${card.last4}</small></h1>
							<p>${locationText(card.location)} — ${describeCycleText(card.cycle)}${card.comment ? ` — ${card.comment}` : ""}</p>
							<cc-statement-list
								.statements=${statements()}
								.today=${now}
								@mark-paid=${onMarkPaid}
								@unmark-paid=${onUnmarkPaid}
								@delete-purchase=${onDeletePurchase}
							></cc-statement-list>
							<button class="secondary" @click=${() => {
								shown += PAGE_SIZE;
								paint();
							}}>${t("card.showOlder")}</button>
						`
						: html`<p><a href="/cards">${t("card.back")}</a></p>`
				}
			`,
			root,
		);

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.card", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (!root) return;
	const cardId = new URLSearchParams(location.search).get("id");
	renderCardPage(repo, cardId, root);
});
