import "#components/cc-card-form";
import "#components/cc-error-banner";
import { html, render } from "lit";
import type { Card, LimitGroup, LocationRecord } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { cardTitle } from "#lib/ui/card-label";
import { createPageState } from "#lib/ui/page-state";
import { subHeader } from "#lib/ui/sub-header";

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
 * The full-screen card form: `/card/new` and `/card/edit?id=<id>` share it under the compact
 * sub-header -- *New card* back to Cards, or the stored card's title (`name · holder (last4)`,
 * steady while the form is typed in) over *Card id can't change*, back to its page. A save
 * replaces the address with the card's page; a failed one keeps the form and what was typed,
 * with the reason. A new card's id must not be stored already. Archive and Delete are on the
 * card page's More menu.
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
	let locations: LocationRecord[] = [];
	let loaded = false;
	let busy = false;
	// The last write failed: its reason shows in the form rather than the page's banner.
	let writeFailed = false;

	const state = createPageState({
		fetch: async () => {
			[groups, locations] = await Promise.all([
				repo.listLimitGroups(),
				repo.listLocations(),
			]);
			if (mode === "new") {
				loaded = true;
				return;
			}
			if (!cardId) throw new MessageError("card.error.noSelection");
			card = await repo.getCard(cardId);
			if (!card) throw new MessageError("card.error.notFound", { id: cardId });
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

	const header = () => {
		if (mode === "new")
			return subHeader({ title: t("cards.page.new"), back: "/cards" });
		if (!card) return subHeader({ title: t("cards.title"), back: "/cards" });
		return subHeader({
			title: cardTitle(card, groups),
			detail: t("form.idImmutable"),
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
								.locations=${locations}
								.busy=${busy}
								.error=${writeFailed ? state.error : ""}
								@save=${onSave}
							></cc-card-form>`
						: ""
				}`,
			root,
		);
	};

	subscribe(() => paint());
	void state.load();
}
