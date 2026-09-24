import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-error-banner";
import "#components/cc-lang-switch";
import "#components/cc-quick-add";
import "#components/cc-statement-list";
import { html, nothing, render } from "lit";
import type { QuickAddDetail } from "#components/cc-quick-add";
import { canPurchase } from "#lib/domain/card";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { displayDate, today } from "#lib/domain/date";
import { spendableRows } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
import { DEFAULT_SETTINGS, type Settings } from "#lib/domain/settings";
import { buildStatement, recentPeriods } from "#lib/domain/statement";
import type {
	Card,
	LimitGroup,
	Purchase,
	Statement,
	StatementPayment,
} from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { describeCycleText, locationText } from "#lib/i18n/format";
import { getLocale, subscribe, t } from "#lib/i18n/index";
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
	// Every card, group, purchase and payment, not just this card's: a limit group is shared,
	// so what this card has left to spend depends on what its siblings have spent too.
	let allCards: Card[] = [];
	let groups: LimitGroup[] = [];
	let allPurchases: Purchase[] = [];
	let allPayments: StatementPayment[] = [];
	let settings: Settings = DEFAULT_SETTINGS;
	let shown = PAGE_SIZE;
	// The period a purchase landed on, not a resolved sentence, so a language switch
	// re-renders the confirmation in the new language (same as on the dashboard).
	let confirmedPurchase: {
		period: string;
		over: number;
		groupName: string;
	} | null = null;

	const state = createPageState({
		fetch: async () => {
			if (!cardId) {
				throw new MessageError("card.error.noSelection");
			}
			card = await repo.getCard(cardId);
			if (!card) {
				throw new MessageError("card.error.notFound", { id: cardId });
			}
			allCards = await repo.listCards();
			groups = await repo.listLimitGroups();
			settings = await repo.getSettings();
			allPurchases = (
				await Promise.all(allCards.map((entry) => repo.listPurchases(entry.id)))
			).flat();
			allPayments = (
				await Promise.all(allCards.map((entry) => repo.listPayments(entry.id)))
			).flat();
			const id = card.id;
			purchases = allPurchases.filter((entry) => entry.cardId === id);
			payments = allPayments.filter((entry) => entry.cardId === id);
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

	const spendable = () =>
		spendableRows(allCards, groups, allPurchases, allPayments, now, settings);

	/** Whether this card takes new purchases: not archived, and kept somewhere that spends. */
	const purchasable = (): boolean =>
		card !== null && !card.archived && canPurchase(card, settings);

	const onAdd = (event: CustomEvent<QuickAddDetail>) =>
		state.guard(async () => {
			const current = card;
			const { cardId, date, amount, note } = event.detail;
			if (!current || current.id !== cardId) return;
			const row = spendable().find((candidate) => candidate.card.id === cardId);
			await repo.savePurchase({
				id: crypto.randomUUID(),
				cardId,
				date,
				amount,
				note,
			});
			confirmedPurchase = {
				period: periodOfPurchase(current.cycle, date),
				over: row ? Math.max(0, amount - row.available) : 0,
				groupName: row?.group.name ?? "",
			};
		}, "card.error.addPurchase");

	const answer = (): string => {
		if (!card || !confirmedPurchase) return "";
		const over =
			confirmedPurchase.over > 0
				? ` ${t("dashboard.answerOver", {
						over: formatAmount(confirmedPurchase.over),
						name: confirmedPurchase.groupName,
					})}`
				: "";
		return `${t("dashboard.answer", {
			close: displayDate(
				closeDateOf(card.cycle, confirmedPurchase.period),
				getLocale(),
			),
			due: displayDate(
				dueDateOf(card.cycle, confirmedPurchase.period),
				getLocale(),
			),
		})}${over}`;
	};

	const paint = () =>
		render(
			html`
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				${
					card
						? html`
							<div class="page-heading">
								<h1>${card.name} <small>${card.id} · ••••${card.last4}</small></h1>
								<p>${locationText(card.location)} — ${describeCycleText(card.cycle)}${card.comment ? ` — ${card.comment}` : ""}</p>
							</div>
							<div class="split">
								<div class="card-statements">
									<cc-statement-list
										.statements=${statements()}
										.today=${now}
										@mark-paid=${onMarkPaid}
										@unmark-paid=${onUnmarkPaid}
										@delete-purchase=${onDeletePurchase}
									></cc-statement-list>
									<button data-variant="quiet" data-action="show-older" @click=${() => {
										shown += PAGE_SIZE;
										paint();
									}}>${t("card.showOlder")}</button>
								</div>
								${
									purchasable()
										? html`
											<article class="split__aside split__aside--lead">
												<h2>${t("dashboard.addPurchase")}</h2>
												<cc-quick-add .cards=${[card]} .rows=${spendable()} .today=${now} .answer=${answer()} @add=${onAdd}></cc-quick-add>
											</article>
										`
										: nothing
								}
							</div>
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
