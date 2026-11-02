import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-card-hero";
import "#components/cc-card-statements";
import "#components/cc-error-banner";
import "#components/cc-more-menu";
import "#components/cc-purchase-sheet";
import { html, nothing, render } from "lit";
import type { MoreItem } from "#components/cc-more-menu";
import { canPurchase } from "#lib/domain/card";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { compareDates, today } from "#lib/domain/date";
import { overRoom as overRoomOf, roomFor } from "#lib/domain/home";
import { nextBill } from "#lib/domain/ledger";
import { formatAmount } from "#lib/domain/money";
import { openPeriod, recentPeriods } from "#lib/domain/statement";
import type { Card, LedgerStatement, Purchase } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { nameOfLocation } from "#lib/i18n/format";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { cardTitle } from "#lib/ui/card-label";
import { newListAddress } from "#lib/ui/list-address";
import { loadMoneyData, type MoneyData } from "#lib/ui/money-data";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";
import { payAddress } from "#lib/ui/pay-address";
import { subHeader } from "#lib/ui/sub-header";

const PAGE_SIZE = 12;

export type CardPageOptions = {
	/** Leaves after a delete; `location.replace`, so Back does not reopen a card that is gone. */
	navigate?: (url: string) => void;
};

/**
 * Whether a card may be deleted: no purchases, and on no draft and no list waiting for the
 * spender. Storage refuses the rest anyway (`deleteCard`); this only hides the button.
 */
async function canDelete(repo: Repository, id: string): Promise<boolean> {
	if ((await repo.listPurchases(id)).length > 0) return false;
	const lists = await repo.listPurchaseLists();
	return !lists.some(
		(list) =>
			list.status !== "saved" && list.lines.some((line) => line.cardId === id),
	);
}

/**
 * The card page (prototype `vCard`): a compact sub-header -- the card's title, its id and where
 * it is kept, *Edit*, and a *More* menu with *Archive card* / *Unarchive card* and, while the
 * card can go, *Delete card* (asking twice; a delete lands on Cards) -- then the hero and stats,
 * *Use on a list* and *Add purchase* (the purchase sheet over the page, staying on it after a
 * save, and saying by how much a purchase went over the room) or why the card can't take one,
 * *Make a payment*, and the statements, each
 * unfolding to its purchases to fix (*Edit* in a sheet, *Delete* asking twice) and the payments
 * that settled it. Exported for tests.
 */
export function renderCardPage(
	repo: Repository,
	cardId: string | null,
	root: HTMLElement,
	options: CardPageOptions = {},
): void {
	const navigate = options.navigate ?? ((url: string) => location.replace(url));
	const now = today();
	let card: Card | null = null;
	let purchases: Purchase[] = [];
	// Every card's ledger, not just this card's: a limit group is shared, so the room this card
	// has to spend depends on what its siblings owe too.
	let data: MoneyData | null = null;
	let shown = PAGE_SIZE;
	// The purchase open in the sheet, by id, so a reload hands the sheet its fresh copy.
	let editingId: string | null = null;
	// The add sheet is open (*Add purchase*).
	let adding = false;
	// Satang the last added purchase went over the room, said once under the hero (DR-11),
	// until the next write on the page (DD-126).
	let overRoom = 0;
	let busy = false;
	// Whether *Delete card* is offered: no purchases, on no open list.
	let deletable = false;
	// A More menu write (archive, delete) in flight, so a second press waits for it.
	let writing = false;
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
			deletable = await canDelete(repo, cardId);
		},
		fallbackKey: "card.error.read",
		paint: () => paint(),
	});

	// Counted back from the latest purchase when one is dated past today, so a purchase
	// entered ahead still has a statement on the page to edit or delete it from (DR-18).
	const latestDate = () =>
		purchases.reduce(
			(date, purchase) =>
				compareDates(purchase.date, date) > 0 ? purchase.date : date,
			now,
		);

	/** Whether a purchase sits in a period older than the oldest one on show. */
	const hasOlder = (current: Card): boolean => {
		const oldest = recentPeriods(current, latestDate(), shown).at(-1) ?? "";
		return purchases.some(
			(purchase) => periodOfPurchase(current.cycle, purchase.date) < oldest,
		);
	};

	const statements = (): LedgerStatement[] => {
		if (!card || !data) return [];
		const current = card;
		const ledger = data.ledgers.get(current.id);
		const open = openPeriod(current, now);
		return recentPeriods(current, latestDate(), shown).map(
			(period): LedgerStatement =>
				ledger?.statements.find((entry) => entry.period === period) ?? {
					cardId: current.id,
					period,
					closeDate: closeDateOf(current.cycle, period),
					dueDate: dueDateOf(current.cycle, period),
					purchases: [],
					total: 0,
					paidAmount: 0,
					payments: [],
					remaining: 0,
					paid: false,
					open: period === open,
				},
		);
	};

	const onDelete = (event: CustomEvent<{ purchase: Purchase }>) => {
		const { purchase } = event.detail;
		overRoom = 0;
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
		overRoom = 0;
		paint();
	};

	const onAdd = () => {
		adding = true;
		sheetFailed = false;
		overRoom = 0;
		paint();
	};

	const closeSheet = () => {
		if (busy) return;
		editingId = null;
		adding = false;
		sheetFailed = false;
		state.clear();
		paint();
	};

	// Closes the sheet only once the purchase is stored; a failure keeps it, with the reason.
	// A new purchase over the room is saved all the same, and the page then says by how much
	// (FR-19); an edit never does, since the room already counts the old amount (DR-11).
	const onSave = async (event: CustomEvent<Purchase>) => {
		if (busy) return;
		busy = true;
		sheetFailed = false;
		paint();
		const over =
			adding && card && data ? overRoomOf(card, data, event.detail.amount) : 0;
		let done = false;
		await state.guard(
			async () => {
				await repo.savePurchase(event.detail);
				done = true;
			},
			adding ? "card.error.addPurchase" : "card.error.editPurchase",
		);
		busy = false;
		if (done) {
			editingId = null;
			adding = false;
			overRoom = over;
		} else sheetFailed = true;
		paint();
	};

	/** Archives or unarchives the card in place; a failure says why in the banner. */
	const toggleArchive = async (current: Card) => {
		writing = true;
		overRoom = 0;
		paint();
		await state.guard(
			() => repo.saveCard({ ...current, archived: !current.archived }),
			"cards.error.archive",
		);
		writing = false;
		paint();
	};

	/** Deletes the card and leaves for Cards; a refusal stays, with storage's reason. */
	const deleteCard = async (current: Card) => {
		writing = true;
		overRoom = 0;
		paint();
		try {
			await repo.deleteCard(current.id);
		} catch (failure) {
			await state.guard(() => Promise.reject(failure), "cards.error.delete");
			writing = false;
			paint();
			return;
		}
		navigate("/cards");
	};

	const onMenu = (event: CustomEvent<{ action: string }>) => {
		if (!card || writing) return;
		if (event.detail.action === "archive") void toggleArchive(card);
		else if (event.detail.action === "delete") void deleteCard(card);
	};

	const menuItems = (current: Card): MoreItem[] => [
		{
			action: "archive",
			label: current.archived ? t("form.unarchive") : t("form.archive"),
		},
		...(deletable
			? [
					{
						action: "delete",
						label: t("form.delete"),
						variant: "danger" as const,
						ask: t("form.deleteAsk", { name: current.name }),
					},
				]
			: []),
	];

	/**
	 * Why this card is not offered on lists, or nothing when it is (FR-22). `toLocations` marks
	 * the one reason the Locations page fixes.
	 */
	const cannotPurchase = (
		current: Card,
	): { text: string; toLocations?: true } | null => {
		// An archived card takes no purchases wherever it is kept, so naming the place as the
		// reason would send the reader to the wrong setting.
		if (current.archived) return { text: t("card.archivedNote") };
		// A list needs the card's group (DR-20), so without one *Use on a list* is a dead end.
		if (data && !roomFor(current, data)) return { text: t("card.noGroupNote") };
		if (data && !canPurchase(current, data.locations))
			return {
				text: t("card.noPurchases", {
					location: nameOfLocation(data.locations, current.location),
				}),
				toLocations: true,
			};
		return null;
	};

	const actions = (current: Card, next: LedgerStatement | null) => {
		const reason = cannotPurchase(current);
		return html`<div class="card-actions">
			${
				reason
					? html`<p class="note">${reason.text}</p>${
							reason.toLocations
								? html`<a class="btn" data-variant="quiet" data-action="settings"
									href="/settings/locations">${t("ready.toSettings")}</a>`
								: nothing
						}`
					: html`<a class="btn" data-action="use-on-list"
							href=${newListAddress([current.id])}>${t("card.useOnList")}</a>
						<button type="button" data-variant="quiet" data-action="add-purchase"
							@click=${onAdd}>${t("card.purchase.add")}</button>`
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
		if (!editing && !adding) return nothing;
		return html`<cc-purchase-sheet
			.card=${current}
			.groups=${data?.groups ?? []}
			.purchase=${editing ?? null}
			.today=${now}
			.error=${sheetFailed ? state.error : ""}
			.busy=${busy}
			@save-purchase=${onSave}
			@close=${closeSheet}
		></cc-purchase-sheet>`;
	};

	const header = (current: Card | null) =>
		current
			? subHeader({
					title: cardTitle(current, data?.groups ?? []),
					detail: t("card.subtitle", {
						id: current.id,
						location: nameOfLocation(data?.locations ?? [], current.location),
					}),
					back: "/cards",
					actions: html`<a class="btn" data-variant="quiet" data-action="edit"
							href=${`/card/edit?id=${encodeURIComponent(current.id)}`}
							aria-label=${t("card.edit")}>${t("common.edit")}</a>
						<cc-more-menu .items=${menuItems(current)} ?busy=${writing}
							@menu-select=${onMenu}></cc-more-menu>`,
				})
			: subHeader({ title: t("cards.title"), back: "/cards" });

	/** After a purchase went over the room: by how much, over which group (FR-19). */
	const overNote = (current: Card) => {
		const group = data?.groups.find((g) => g.id === current.limitGroupId);
		if (overRoom <= 0 || !group) return nothing;
		return html`<p class="card-over" role="status" data-over-room>${t(
			"card.overRoom",
			{ over: formatAmount(overRoom), group: group.name },
		)}</p>`;
	};

	const page = (current: Card) => {
		const ledger = data?.ledgers.get(current.id);
		const next = ledger ? nextBill(ledger, now) : null;
		const badges = [
			current.archived ? t("cards.archived") : null,
			current.supplementary ? t("form.supplementary") : null,
		].filter((badge): badge is string => badge !== null);
		return html`
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
				.locations=${data?.locations ?? []}
			></cc-card-hero>
			${current.comment ? html`<p class="card-comment">${current.comment}</p>` : nothing}
			${overNote(current)}
			${actions(current, next)}
			<section class="card-statements">
				<h2>${t("card.statements")}</h2>
				<cc-card-statements
					.statements=${statements()}
					.today=${now}
					@edit-purchase=${onEdit}
					@delete-purchase=${onDelete}
				></cc-card-statements>
				${
					hasOlder(current)
						? html`<button type="button" data-variant="quiet" data-action="show-older" @click=${() => {
								shown += PAGE_SIZE;
								paint();
							}}>${t("card.showOlder")}</button>`
						: nothing
				}
			</section>
			${sheet(current)}
		`;
	};

	const paint = () =>
		render(
			html`
				${header(card)}
				<cc-error-banner .message=${sheetFailed || busy ? "" : state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				${card ? page(card) : nothing}
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
