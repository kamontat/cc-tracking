import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-card-hero";
import "#components/cc-card-statements";
import "#components/cc-error-banner";
import "#components/cc-purchase-sheet";
import { html, nothing, render } from "lit";
import { canPurchase } from "#lib/domain/card";
import { closeDateOf, dueDateOf } from "#lib/domain/cycle";
import { compareDates, today } from "#lib/domain/date";
import { roomFor } from "#lib/domain/home";
import { nextBill } from "#lib/domain/ledger";
import { DEFAULT_SETTINGS } from "#lib/domain/settings";
import { openPeriod, recentPeriods } from "#lib/domain/statement";
import type { Card, LedgerStatement, Purchase } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { locationText } from "#lib/i18n/format";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { backHeader } from "#lib/ui/back-header";
import { cardLine } from "#lib/ui/card-label";
import { newListAddress } from "#lib/ui/list-address";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";
import { payAddress } from "#lib/ui/pay-address";

const PAGE_SIZE = 12;

/**
 * The card page (prototype `vCard`): a back header with *Edit*, the hero and stats, *Use on a
 * list* or why the card can't take one, *Make a payment*, and the statements, each unfolding to
 * its purchases to fix (*Edit* in a sheet, *Delete* asking twice). Purchases are added only from
 * purchase lists (DD-67). Exported for tests.
 */
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
	// The purchase open in the sheet, by id, so a reload hands the sheet its fresh copy.
	let editingId: string | null = null;
	let busy = false;
	// Whether the open sheet's last save failed, so an older page error stays out of it.
	let sheetFailed = false;
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
		// entered ahead still has a statement on the page to edit or delete it from (DR-18).
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

	const onDelete = (event: CustomEvent<{ purchase: Purchase }>) => {
		const { purchase } = event.detail;
		return state.guard(
			() => repo.deletePurchase(purchase.cardId, purchase.id),
			"card.error.deletePurchase",
		);
	};

	// Editing is open to any purchase on the page, an archived card's included: it corrects
	// history rather than adding to it.
	const onEdit = (event: CustomEvent<{ purchase: Purchase }>) => {
		editingId = event.detail.purchase.id;
		sheetFailed = false;
		paint();
	};

	const closeSheet = () => {
		if (busy) return;
		editingId = null;
		sheetFailed = false;
		state.clear();
		paint();
	};

	// Closes the sheet only once the purchase is stored; a failure keeps it, with the reason.
	const onSave = async (event: CustomEvent<Purchase>) => {
		if (busy) return;
		busy = true;
		sheetFailed = false;
		paint();
		let done = false;
		await state.guard(async () => {
			await repo.savePurchase(event.detail);
			done = true;
		}, "card.error.editPurchase");
		busy = false;
		if (done) editingId = null;
		else sheetFailed = true;
		paint();
	};

	/** Why this card is not offered on lists, or nothing when it is (FR-22). */
	const cannotPurchase = (current: Card): string | null => {
		// An archived card takes no purchases wherever it is kept, so naming the place as the
		// reason would send the reader to the wrong setting.
		if (current.archived) return t("card.archivedNote");
		// A list needs the card's group (DR-20), so without one *Use on a list* is a dead end.
		if (data && !roomFor(current, data)) return t("card.noGroupNote");
		if (!canPurchase(current, data?.settings ?? DEFAULT_SETTINGS))
			return t("card.noPurchases", {
				location: locationText(current.location),
			});
		return null;
	};

	const actions = (current: Card, next: LedgerStatement | null) => {
		const reason = cannotPurchase(current);
		return html`<div class="card-actions">
			${
				reason
					? html`<p class="note">${reason}</p>`
					: html`<a class="btn" data-action="use-on-list"
							href=${newListAddress([current.id])}>${t("card.useOnList")}</a>`
			}
			<a class="btn" data-variant="quiet" data-action="pay"
				href=${payAddress({ cardId: current.id, amount: next?.remaining ?? 0 })}
				>${t("card.pay")}</a>
		</div>`;
	};

	const sheet = (current: Card) => {
		const editing = editingId
			? purchases.find((entry) => entry.id === editingId)
			: undefined;
		if (!editing) return nothing;
		return html`<cc-purchase-sheet
			.card=${current}
			.groups=${data?.groups ?? []}
			.purchase=${editing}
			.today=${now}
			.error=${sheetFailed ? state.error : ""}
			.busy=${busy}
			@save-purchase=${onSave}
			@close=${closeSheet}
		></cc-purchase-sheet>`;
	};

	const page = (current: Card) => {
		const ledger = data?.ledgers.get(current.id);
		const next = ledger ? nextBill(ledger, now) : null;
		const badges = [
			current.archived ? t("cards.archived") : null,
			current.supplementary ? t("form.supplementary") : null,
		].filter((badge): badge is string => badge !== null);
		return html`
			${backHeader({
				title: cardLine(current.id, current, { short: true }),
				detail: `${current.name} · ••••${current.last4}`,
				back: "/cards",
				action: html`<a class="btn" data-variant="quiet" data-action="edit"
					href=${`/card/edit?id=${encodeURIComponent(current.id)}`}
					aria-label=${t("card.edit")}>${t("common.edit")}</a>`,
			})}
			${
				badges.length > 0
					? html`<p class="card-badges">${badges.map(
							(badge) => html`<span class="badge">${badge}</span>`,
						)}</p>`
					: nothing
			}
			<cc-card-hero
				.card=${current}
				.cards=${data?.cards ?? []}
				.groups=${data?.groups ?? []}
				.room=${data ? roomFor(current, data) : null}
				.owed=${ledger?.owed ?? 0}
				.credit=${ledger?.credit ?? 0}
				.next=${next}
				.today=${now}
			></cc-card-hero>
			${current.comment ? html`<p class="card-comment">${current.comment}</p>` : nothing}
			${actions(current, next)}
			<section class="card-statements">
				<h2>${t("card.statements")}</h2>
				<cc-card-statements
					.statements=${statements()}
					.today=${now}
					@edit-purchase=${onEdit}
					@delete-purchase=${onDelete}
				></cc-card-statements>
				<button type="button" data-variant="quiet" data-action="show-older" @click=${() => {
					shown += PAGE_SIZE;
					paint();
				}}>${t("card.showOlder")}</button>
			</section>
			${sheet(current)}
		`;
	};

	const paint = () =>
		render(
			html`
				<cc-error-banner .message=${sheetFailed || busy ? "" : state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				${card ? page(card) : backHeader({ title: t("cards.title"), back: "/cards" })}
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
