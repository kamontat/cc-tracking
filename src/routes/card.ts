import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-card-summary";
import "#components/cc-error-banner";
import "#components/cc-statement-list";
import { html, nothing, render } from "lit";
import type { QuickAddDetail } from "#components/cc-quick-add";
import { canPurchase } from "#lib/domain/card";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { compareDates, displayDate, today } from "#lib/domain/date";
import { roomFor } from "#lib/domain/home";
import { nextBill } from "#lib/domain/ledger";
import type { SpendRow } from "#lib/domain/limit";
import { formatAmount } from "#lib/domain/money";
import { cardOwnerOf, groupLabel } from "#lib/domain/owner";
import { DEFAULT_SETTINGS } from "#lib/domain/settings";
import { openPeriod, recentPeriods } from "#lib/domain/statement";
import type {
	Card,
	LedgerStatement,
	LimitGroup,
	Purchase,
} from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { describeCycleText, locationText } from "#lib/i18n/format";
import { getLocale, subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
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
	// Every card's ledger, not just this card's: a limit group is shared, so the room this card
	// has to spend depends on what its siblings owe too.
	let data: MoneyData | null = null;
	let shown = PAGE_SIZE;
	// The period a purchase landed on, not a resolved sentence, so a language switch
	// re-renders the confirmation in the new language (same as on the dashboard).
	let confirmedPurchase: {
		period: string;
		over: number;
		groupName: string;
	} | null = null;
	let adding = false;
	// The saved purchase the dialog is open to edit, or null when it adds a new one.
	let editing: Purchase | null = null;
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
			data = await loadMoneyData(repo, now);
			purchases = data.purchases.filter((entry) => entry.cardId === cardId);
		},
		fallbackKey: "card.error.read",
		paint: () => paint(),
	});

	const statements = (): LedgerStatement[] => {
		if (!card || !data) return [];
		const current = card;
		const ledger = data.ledgers.get(current.id);
		const open = openPeriod(current, now);
		// Counted back from the latest purchase when one is dated past today, so a purchase
		// entered ahead still has a statement on the page to edit or delete it from.
		const latest = purchases.reduce(
			(date, purchase) =>
				compareDates(purchase.date, date) > 0 ? purchase.date : date,
			now,
		);
		return recentPeriods(current, latest, shown).map(
			(period): LedgerStatement =>
				ledger?.statements.find((entry) => entry.period === period) ?? {
					cardId: current.id,
					period,
					closeDate: closeDateOf(current.cycle, period),
					dueDate: dueDateOf(current.cycle, period),
					purchases: [],
					total: 0,
					paidAmount: 0,
					remaining: 0,
					paid: false,
					open: period === open,
				},
		);
	};

	const onDeletePurchase = (
		event: CustomEvent<{ cardId: string; purchaseId: string }>,
	) =>
		state.guard(
			() => repo.deletePurchase(event.detail.cardId, event.detail.purchaseId),
			"card.error.deletePurchase",
		);

	/** This card's row for the purchase dialog: the room its group has left to spend. */
	const spendable = (): SpendRow[] => {
		if (!card || !data) return [];
		const room = roomFor(card, data);
		if (!room) return [];
		const period = openPeriod(card, now);
		return [
			{
				card,
				group: room.group,
				used: room.used,
				available: room.room,
				closeDate: closeDateOf(card.cycle, period),
				dueDate: dueDateOf(card.cycle, period),
				sharedWith: room.sharedWith,
			},
		];
	};

	/** Whether this card takes new purchases: not archived, and kept somewhere that spends. */
	const purchasable = (): boolean =>
		card !== null &&
		!card.archived &&
		canPurchase(card, data?.settings ?? DEFAULT_SETTINGS);

	const openAdd = () => {
		adding = true;
		editing = null;
		addSubmitted = false;
		paint();
	};

	// Editing is open to any purchase on the page, an archived card's included: it corrects
	// history rather than adding to it.
	const onEditPurchase = (
		event: CustomEvent<{ cardId: string; purchaseId: string }>,
	) => {
		editing =
			purchases.find((entry) => entry.id === event.detail.purchaseId) ?? null;
		adding = false;
		addSubmitted = false;
		paint();
	};

	const closeAdd = () => {
		adding = false;
		editing = null;
		paint();
	};

	// Closes the dialog only once the purchase is stored, as on the dashboard.
	const onAdd = (event: CustomEvent<QuickAddDetail>) => {
		addSubmitted = true;
		const { id, cardId, date, amount, note } = event.detail;
		// An edit keeps when the purchase was first entered; only a new one is stamped now.
		const addedAt = id
			? purchases.find((entry) => entry.id === id)?.addedAt
			: new Date().toISOString();
		return state.guard(
			async () => {
				const current = card;
				if (!current || current.id !== cardId) return;
				const row = spendable().find(
					(candidate) => candidate.card.id === cardId,
				);
				await repo.savePurchase({
					id: id ?? crypto.randomUUID(),
					cardId,
					date,
					amount,
					note,
					...(addedAt ? { addedAt } : {}),
				});
				confirmedPurchase = {
					period: periodOfPurchase(current.cycle, date),
					// What is left already counts an edited purchase's old amount, so only a new
					// purchase is weighed against it.
					over: row && !id ? Math.max(0, amount - row.available) : 0,
					groupName: row?.group.name ?? "",
				};
				adding = false;
				editing = null;
			},
			id ? "card.error.editPurchase" : "card.error.addPurchase",
		);
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
		data?.groups.find(({ id }) => id === current.limitGroupId) ?? null;

	const summary = (current: Card) => {
		const ledger = data?.ledgers.get(current.id);
		return html`
			<cc-card-summary
				.room=${data ? roomFor(current, data) : null}
				.owed=${ledger?.owed ?? 0}
				.credit=${ledger?.credit ?? 0}
				.next=${ledger ? nextBill(ledger, now) : null}
				.today=${now}
				payHref=${`/pay?card=${encodeURIComponent(current.id)}`}
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
					!current.archived &&
					!canPurchase(current, data?.settings ?? DEFAULT_SETTINGS)
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
										@edit-purchase=${onEditPurchase}
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
								editing || (adding && purchasable())
									? purchaseDialog({
											cards: [card],
											rows: spendable(),
											today: now,
											error: addSubmitted ? state.error : "",
											purchase: editing,
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
