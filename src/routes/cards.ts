import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-card-form";
import "#components/cc-card-table";
import "#components/cc-error-banner";
import "#components/cc-lang-switch";
import "#components/cc-limit-group-form";
import "#components/cc-limit-group-table";
import { html, nothing, render } from "lit";
import { today } from "#lib/domain/date";
import { groupUsage } from "#lib/domain/limit";
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
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";

/** Renders the card registry page into `root`, wiring it to `repo`. Exported for tests and for Task 14 to extend. */
export function renderCardsPage(
	repo: Repository,
	root: HTMLElement,
	storage: Storage = globalThis.localStorage,
): void {
	let cards: Card[] = [];
	let purchases: Purchase[] = [];
	let payments: StatementPayment[] = [];
	let counts: Record<string, number> = {};
	let groups: LimitGroup[] = [];
	let editing: Card | null = null;
	let editingGroup: LimitGroup | null = null;
	// Read once per page load: the notice is consumed here, not on every paint.
	let resetNames = takeResetNotice(storage);
	const now = today();

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
		},
		fallbackKey: "cards.error.read",
		paint: () => paint(),
	});

	const onSave = (event: CustomEvent<Card>) =>
		state.guard(async () => {
			const card = event.detail;
			if (!editing) {
				const existing = await repo.getCard(card.id);
				if (existing) {
					throw new MessageError("cards.error.duplicateId", { id: card.id });
				}
			}
			await repo.saveCard(card);
			editing = null;
		}, "cards.error.save");

	const onRemove = (event: CustomEvent<string>) =>
		state.guard(async () => {
			await repo.deleteCard(event.detail);
			// Left loaded, the form would still hold the deleted record, and Save would write it
			// straight back -- a delete the reader watched happen, undone by a button that looks
			// like it is only saving an edit.
			if (editing?.id === event.detail) editing = null;
		}, "cards.error.delete");

	const onArchive = (event: CustomEvent<string>) =>
		state.guard(async () => {
			const card = cards.find((c) => c.id === event.detail);
			if (card) await repo.saveCard({ ...card, archived: !card.archived });
		}, "cards.error.archive");

	const onEdit = (event: CustomEvent<string>) => {
		// Copied, not handed over as-is: picking the same row twice would otherwise hand the form
		// the identical object, Lit's `!==` dirty check would see no change, and the form would
		// never learn to open itself again after the reader collapsed it.
		const card = cards.find((c) => c.id === event.detail);
		editing = card ? { ...card } : null;
		paint();
	};

	const onSaveGroup = (event: CustomEvent<LimitGroup>) =>
		state.guard(async () => {
			await repo.saveLimitGroup(event.detail);
			editingGroup = null;
		}, "cards.error.saveGroup");

	const onEditGroup = (event: CustomEvent<string>) => {
		// Copied for the same reason `onEdit` copies a card: the same object twice reads as no
		// change at all to the form bound to it.
		const group = groups.find((one) => one.id === event.detail);
		editingGroup = group ? { ...group } : null;
		paint();
	};

	const onRemoveGroup = (event: CustomEvent<string>) =>
		state.guard(async () => {
			await repo.deleteLimitGroup(event.detail);
			if (editingGroup?.id === event.detail) editingGroup = null;
		}, "cards.error.deleteGroup");

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
					<cc-card-form
						.card=${editing}
						.groups=${groups}
						@save=${onSave}
						@cancel=${() => {
							editing = null;
							paint();
						}}
					></cc-card-form>
				</article>
				<article>
					<cc-card-table
						.cards=${cards}
						.purchaseCounts=${counts}
						.groups=${groups}
						@edit=${onEdit}
						@archive=${onArchive}
						@remove=${onRemove}
					></cc-card-table>
				</article>
				<article>
					<cc-limit-group-form
						.group=${editingGroup}
						@save-group=${onSaveGroup}
						@cancel=${() => {
							editingGroup = null;
							paint();
						}}
					></cc-limit-group-form>
				</article>
				<article>
					<cc-limit-group-table
						.groups=${groups}
						.usage=${usage()}
						.counts=${groupCounts()}
						@edit-group=${onEditGroup}
						@remove-group=${onRemoveGroup}
					></cc-limit-group-table>
				</article>
			`,
			root,
		);

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.cards", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderCardsPage(repo, root);
});
