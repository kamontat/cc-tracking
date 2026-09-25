import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-card-summary";
import "#components/cc-error-banner";
import "#components/cc-lang-switch";
import "#components/cc-statement-list";
import { html, nothing, render } from "lit";
import type { QuickAddDetail } from "#components/cc-quick-add";
import { canPurchase } from "#lib/domain/card";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { displayDate, today } from "#lib/domain/date";
import { groupUsage, outstandingOf, spendableRows } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
import { cardOwnerOf, groupLabel } from "#lib/domain/owner";
import { DEFAULT_SETTINGS, type Settings } from "#lib/domain/settings";
import {
	buildStatement,
	nextActionable,
	recentPeriods,
} from "#lib/domain/statement";
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
import {
	addPurchaseButton,
	purchaseDialog,
	purchaseStatus,
} from "#lib/ui/purchase-dialog";

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
	let adding = false;
	// Whether the open dialog has tried a save yet, so an older page error stays out of it.
	let addSubmitted = false;

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

	const openAdd = () => {
		adding = true;
		addSubmitted = false;
		paint();
	};

	const closeAdd = () => {
		adding = false;
		paint();
	};

	// Closes the dialog only once the purchase is stored, as on the dashboard.
	const onAdd = (event: CustomEvent<QuickAddDetail>) => {
		addSubmitted = true;
		return state.guard(async () => {
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
			adding = false;
		}, "card.error.addPurchase");
	};

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

	const groupOf = (current: Card): LimitGroup | null =>
		groups.find(({ id }) => id === current.limitGroupId) ?? null;

	const summary = (current: Card) => {
		const group = groupOf(current);
		return html`
			<cc-card-summary
				.group=${group}
				.used=${group ? groupUsage(group, allCards, allPurchases, allPayments, now) : 0}
				.sharedWith=${
					group
						? allCards.filter((entry) => entry.limitGroupId === group.id)
								.length - 1
						: 0
				}
				.owed=${outstandingOf(current, purchases, payments, now)}
				.next=${nextActionable(current, purchases, payments, now)}
				.today=${now}
			></cc-card-summary>
		`;
	};

	/** The card's own facts beside its history, and the one way off this page to change them. */
	const details = (current: Card) => {
		const group = groupOf(current);
		const owner = cardOwnerOf(current, group);
		const row = (label: string, value: string) =>
			html`<div class="facts__row" row><dt>${label}</dt><dd>${value}</dd></div>`;
		return html`
			<article class="card-details split__aside">
				<h2>${t("card.details")}</h2>
				<dl class="facts">
					${row(t("card.group"), group ? groupLabel(group) : t("cards.unassigned"))}
					${owner ? row(t("card.owner"), owner) : nothing}
					${row(t("card.location"), locationText(current.location))}
					${row(t("card.cycle"), describeCycleText(current.cycle))}
				</dl>
				${
					// An archived card takes no purchases wherever it is kept, so naming the place as
					// the reason would send the reader to the wrong setting.
					!current.archived && !canPurchase(current, settings)
						? html`<p class="note">${t("card.noPurchases", {
								location: locationText(current.location),
							})}</p>`
						: nothing
				}
				<a class="edit" href=${`/cards?edit=${encodeURIComponent(current.id)}`}>${t("card.edit")}</a>
			</article>
		`;
	};

	const paint = () =>
		render(
			html`
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				${
					card
						? html`
							<a class="back" href="/cards">${t("card.backShort")}</a>
							<div class="page-title" row>
								<div class="page-heading">
									<h1>
										${card.name}
										${card.archived ? html`<span class="badge">${t("cards.archived")}</span>` : nothing}
										${card.supplementary ? html`<span class="badge">${t("form.supplementary")}</span>` : nothing}
									</h1>
									<p class="meta"><span class="mono">${card.id}</span> · ••••${card.last4} · ${locationText(card.location)} · ${describeCycleText(card.cycle)}</p>
									${card.comment ? html`<p class="comment">${card.comment}</p>` : nothing}
								</div>
								${purchasable() ? addPurchaseButton(openAdd) : nothing}
							</div>
							${purchaseStatus(answer(), () => {
								confirmedPurchase = null;
								paint();
							})}
							${summary(card)}
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
								${details(card)}
							</div>
							${
								adding && purchasable()
									? purchaseDialog({
											cards: [card],
											rows: spendable(),
											today: now,
											error: addSubmitted ? state.error : "",
											onAdd,
											onClose: closeAdd,
											onRetry: () => state.load(),
										})
									: nothing
							}
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
