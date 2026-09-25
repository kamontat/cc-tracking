import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-card-form";
import "#components/cc-card-table";
import "#components/cc-error-banner";
import "#components/cc-lang-switch";
import "#components/cc-limit-group-form";
import "#components/cc-limit-group-table";
import "#components/cc-modal";
import { html, nothing, render } from "lit";
import { today } from "#lib/domain/date";
import { groupUsage } from "#lib/domain/limit";
import type { CardView, GroupView } from "#lib/domain/list-view";
import type {
	Card,
	LimitGroup,
	Purchase,
	StatementPayment,
} from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { subscribe, t } from "#lib/i18n/index";
import { takeResetNotice } from "#lib/storage/migrate-locations";
import type { Repository } from "#lib/storage/repository";
import { readViews, type Views, writeViews } from "#lib/ui/list-view-query";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";

/**
 * Renders the card registry page into `root`, wiring it to `repo`. `editId` is the card a link
 * from its detail page asked to edit (`/cards?edit=<id>`): opened in the edit dialog once the
 * list arrives, and ignored when no such card exists. `query` seeds both lists' search, filter and
 * sort; every change to them is handed back through `onQuery` as the next query string, so a
 * reload or a shared link reopens the same view. Exported for tests.
 */
export function renderCardsPage(
	repo: Repository,
	root: HTMLElement,
	storage: Storage = globalThis.localStorage,
	editId: string | null = null,
	query: URLSearchParams = new URLSearchParams(),
	onQuery: (query: URLSearchParams) => void = () => {},
): void {
	let cards: Card[] = [];
	let purchases: Purchase[] = [];
	let payments: StatementPayment[] = [];
	let counts: Record<string, number> = {};
	let groups: LimitGroup[] = [];
	// Which dialog is open, and on what: `null` is closed, a `null` record is an add. Only one
	// can be open at a time -- the backdrop covers everything that could open the other.
	let cardDialog: { card: Card | null } | null = null;
	let groupDialog: { group: LimitGroup | null } | null = null;
	// Whether the open dialog has tried a save yet. The page's error can predate the dialog (a
	// failed load, say), and must not greet a reader who has only just opened it.
	let dialogSubmitted = false;
	// Read once per page load: the notice is consumed here, not on every paint.
	let resetNames = takeResetNotice(storage);
	// Taken on the first load only: a later refresh must not reopen the dialog on this card
	// after the reader has saved it or moved on to another.
	let pendingEdit = editId;
	let views = readViews(query);
	const now = today();

	const onViewChange = (next: Partial<Views>) => {
		views = { ...views, ...next };
		query = writeViews(query, views);
		onQuery(query);
		paint();
	};

	const openCard = (card: Card | null) => {
		cardDialog = { card };
		dialogSubmitted = false;
		paint();
	};

	const openGroup = (group: LimitGroup | null) => {
		groupDialog = { group };
		dialogSubmitted = false;
		paint();
	};

	const closeDialogs = () => {
		cardDialog = null;
		groupDialog = null;
		paint();
	};

	const state = createPageState({
		fetch: async () => {
			cards = await repo.listCards();
			groups = await repo.listLimitGroups();
			purchases = (
				await Promise.all(cards.map((card) => repo.listPurchases(card.id)))
			).flat();
			payments = (
				await Promise.all(cards.map((card) => repo.listPayments(card.id)))
			).flat();
			counts = Object.fromEntries(
				cards.map((card) => [
					card.id,
					purchases.filter((purchase) => purchase.cardId === card.id).length,
				]),
			);
			if (pendingEdit !== null) {
				const wanted = cards.find((card) => card.id === pendingEdit);
				pendingEdit = null;
				if (wanted) {
					cardDialog = { card: wanted };
					dialogSubmitted = false;
				}
			}
		},
		fallbackKey: "cards.error.read",
		paint: () => paint(),
	});

	// Each save closes its dialog only once the write has landed: a refused or failed save leaves
	// it open on what the reader typed, with the reason shown inside it.
	const onSave = (event: CustomEvent<Card>) => {
		dialogSubmitted = true;
		return state.guard(async () => {
			const card = event.detail;
			if (!cardDialog?.card) {
				const existing = await repo.getCard(card.id);
				if (existing) {
					throw new MessageError("cards.error.duplicateId", { id: card.id });
				}
			}
			await repo.saveCard(card);
			cardDialog = null;
		}, "cards.error.save");
	};

	const onRemove = (event: CustomEvent<string>) =>
		state.guard(async () => {
			await repo.deleteCard(event.detail);
			// Left open, the dialog would still hold the deleted record, and Save would write it
			// straight back -- a delete the reader watched happen, undone by a button that looks
			// like it is only saving an edit.
			if (cardDialog?.card?.id === event.detail) cardDialog = null;
		}, "cards.error.delete");

	const onArchive = (event: CustomEvent<string>) =>
		state.guard(async () => {
			const card = cards.find((c) => c.id === event.detail);
			if (card) await repo.saveCard({ ...card, archived: !card.archived });
		}, "cards.error.archive");

	const onEdit = (event: CustomEvent<string>) => {
		const card = cards.find((c) => c.id === event.detail);
		if (card) openCard(card);
	};

	const onSaveGroup = (event: CustomEvent<LimitGroup>) => {
		dialogSubmitted = true;
		return state.guard(async () => {
			await repo.saveLimitGroup(event.detail);
			groupDialog = null;
		}, "cards.error.saveGroup");
	};

	const onEditGroup = (event: CustomEvent<string>) => {
		const group = groups.find((one) => one.id === event.detail);
		if (group) openGroup(group);
	};

	const onRemoveGroup = (event: CustomEvent<string>) =>
		state.guard(async () => {
			await repo.deleteLimitGroup(event.detail);
			if (groupDialog?.group?.id === event.detail) groupDialog = null;
		}, "cards.error.deleteGroup");

	/** The open dialog, if any, with its form and -- once a save has failed -- the reason. */
	const dialog = () => {
		if (!cardDialog && !groupDialog) return nothing;
		const error = dialogSubmitted ? state.error : "";
		const banner = html`<cc-error-banner .message=${error} retry-label=${t("common.reload")}
			@retry=${() => state.load()}></cc-error-banner>`;
		if (cardDialog) {
			const card = cardDialog.card;
			return html`
				<cc-modal heading=${card ? t("cards.edit", { name: card.name }) : t("cards.add")}
					@close=${closeDialogs}>
					${banner}
					<cc-card-form .card=${card} .groups=${groups} @save=${onSave}
						@cancel=${closeDialogs}></cc-card-form>
				</cc-modal>
			`;
		}
		const group = groupDialog?.group ?? null;
		return html`
			<cc-modal heading=${group ? t("limits.edit", { name: group.name }) : t("limits.add")}
				@close=${closeDialogs}>
				${banner}
				<cc-limit-group-form .group=${group} @save-group=${onSaveGroup}
					@cancel=${closeDialogs}></cc-limit-group-form>
			</cc-modal>
		`;
	};

	const usage = (): Record<string, number> =>
		Object.fromEntries(
			groups.map((group) => [
				group.id,
				groupUsage(group, cards, purchases, payments, now),
			]),
		);

	const groupCounts = (): Record<string, number> =>
		Object.fromEntries(
			groups.map((group) => [
				group.id,
				cards.filter((card) => card.limitGroupId === group.id).length,
			]),
		);

	const paint = () =>
		render(
			html`
				<h1>${t("cards.title")}</h1>
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				${
					resetNames.length > 0
						? html`
							<article data-testid="location-reset">
								<p>${t("cards.locationReset", { names: resetNames.join(", ") })}</p>
								<button data-variant="quiet" type="button" @click=${() => {
									resetNames = [];
									paint();
								}}>${t("common.dismiss")}</button>
							</article>
						`
						: nothing
				}
				<article>
					<div class="list-actions" row>
						<button type="button" data-action="add-card" @click=${() => openCard(null)}>${t("cards.add")}</button>
					</div>
					<cc-card-table
						.cards=${cards}
						.purchaseCounts=${counts}
						.groups=${groups}
						.view=${views.cards}
						@view-change=${(event: CustomEvent<CardView>) => onViewChange({ cards: event.detail })}
						@edit=${onEdit}
						@archive=${onArchive}
						@remove=${onRemove}
					></cc-card-table>
				</article>
				<article>
					<div class="list-actions" row>
						<button type="button" data-action="add-group" @click=${() => openGroup(null)}>${t("limits.add")}</button>
					</div>
					<cc-limit-group-table
						.groups=${groups}
						.usage=${usage()}
						.counts=${groupCounts()}
						.view=${views.groups}
						@view-change=${(event: CustomEvent<GroupView>) => onViewChange({ groups: event.detail })}
						@edit-group=${onEditGroup}
						@remove-group=${onRemoveGroup}
					></cc-limit-group-table>
				</article>
				${dialog()}
			`,
			root,
		);

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.cards", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (!root) return;
	const query = new URLSearchParams(location.search);
	renderCardsPage(
		repo,
		root,
		globalThis.localStorage,
		query.get("edit"),
		query,
		// Replaced, not pushed: every keystroke in a search box is not a step Back should retrace.
		(next) => {
			const search = next.toString();
			history.replaceState(
				history.state,
				"",
				`${location.pathname}${search ? `?${search}` : ""}${location.hash}`,
			);
		},
	);
});
