import "#components/cc-card-form";
import "#components/cc-error-banner";
import { html, render } from "lit";
import type { Card, LimitGroup } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { backHeader } from "#lib/ui/back-header";
import { cardLine } from "#lib/ui/card-label";
import { createPageState } from "#lib/ui/page-state";

export type CardEditOptions = {
	/** The address's query; `location.search` unless a test passes its own. */
	search?: string;
	/** Leaves after a write; `location.replace`, so Back does not reopen the form. */
	navigate?: (url: string) => void;
};

/** The card page's address. */
export const cardAddress = (id: string): string =>
	`/card?id=${encodeURIComponent(id)}`;

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
 * The full-screen card form: `/card/new` and `/card/edit?id=<id>` share it under a back header
 * (to Cards, or to the card's page). A save replaces the address with the card's page; a failed
 * one keeps the form and what was typed, with the reason. Editing adds *Archive card* /
 * *Unarchive card*, and *Delete card* (asking twice) while the card can go; a delete lands on
 * Cards. A new card's id must not be stored already.
 */
export function renderCardEditPage(
	repo: Repository,
	root: HTMLElement,
	mode: "new" | "edit",
	options: CardEditOptions = {},
): void {
	const search = options.search ?? location.search;
	const navigate = options.navigate ?? ((url: string) => location.replace(url));
	// The form is the page: the floating + New menu would sit over its buttons on a phone.
	root.ownerDocument.documentElement.setAttribute("data-form-page", "");
	const cardId = mode === "edit" ? new URLSearchParams(search).get("id") : null;

	let card: Card | null = null;
	let groups: LimitGroup[] = [];
	let deletable = false;
	let loaded = false;
	let busy = false;
	// The last write failed: its reason shows in the form rather than the page's banner.
	let writeFailed = false;

	const state = createPageState({
		fetch: async () => {
			groups = await repo.listLimitGroups();
			if (mode === "new") {
				loaded = true;
				return;
			}
			if (!cardId) throw new MessageError("card.error.noSelection");
			card = await repo.getCard(cardId);
			if (!card) throw new MessageError("card.error.notFound", { id: cardId });
			deletable = await canDelete(repo, cardId);
			loaded = true;
		},
		fallbackKey: "card.error.read",
		paint: () => paint(),
	});

	/** Runs a write; on success leaves for `to`, else keeps the form with the reason. */
	const write = async (
		action: () => Promise<void>,
		key: Parameters<typeof state.guard>[1],
		to: string,
	) => {
		if (busy) return;
		busy = true;
		writeFailed = false;
		paint();
		let done = false;
		await state.guard(async () => {
			await action();
			done = true;
		}, key);
		busy = false;
		if (done) {
			navigate(to);
			return;
		}
		writeFailed = true;
		paint();
	};

	const onSave = (event: CustomEvent<Card>) => {
		const next = event.detail;
		return write(
			async () => {
				if (mode === "new" && (await repo.getCard(next.id))) {
					throw new MessageError("cards.error.duplicateId", { id: next.id });
				}
				await repo.saveCard(next);
			},
			"cards.error.save",
			cardAddress(next.id),
		);
	};

	const onArchive = (event: CustomEvent<{ card: Card }>) => {
		const current = event.detail.card;
		return write(
			() => repo.saveCard({ ...current, archived: !current.archived }),
			"cards.error.archive",
			cardAddress(current.id),
		);
	};

	const onDelete = (event: CustomEvent<{ card: Card }>) =>
		write(
			() => repo.deleteCard(event.detail.card.id),
			"cards.error.delete",
			"/cards",
		);

	const header = () => {
		if (mode === "new")
			return backHeader({ title: t("cards.page.add"), back: "/cards" });
		if (!card) return backHeader({ title: t("cards.title"), back: "/cards" });
		return backHeader({
			title: t("cards.edit", {
				name: cardLine(card.id, card, { short: true }),
			}),
			back: cardAddress(card.id),
		});
	};

	const paint = () => {
		const showForm = loaded && (mode === "new" || card !== null);
		render(
			html`${header()}
				<cc-error-banner .message=${writeFailed || busy ? "" : state.error}
					retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				${
					showForm
						? html`<cc-card-form
								.card=${card}
								.groups=${groups}
								.deletable=${deletable}
								.busy=${busy}
								.error=${writeFailed ? state.error : ""}
								@save=${onSave}
								@archive=${onArchive}
								@delete-card=${onDelete}
							></cc-card-form>`
						: ""
				}`,
			root,
		);
	};

	subscribe(() => paint());
	void state.load();
}
