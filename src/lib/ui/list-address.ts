import type { PurchaseList } from "#lib/domain/types";

/**
 * Each case of a purchase list has its own page, so a link says what it opens: a new list
 * (`/list/new`), a draft to edit (`/list/draft`), the spender's reply to a waiting list
 * (`/list/reply`) and a saved list (`/list/view`).
 */
const PAGE: Record<PurchaseList["status"], string> = {
	draft: "/list/draft",
	sent: "/list/reply",
	saved: "/list/view",
};

/** A new purchase list for `cardIds`, one `card` parameter each, in the order given. */
export function newListAddress(cardIds: string[]): string {
	const query = new URLSearchParams();
	for (const id of cardIds) query.append("card", id);
	return `/list/new?${query.toString()}`;
}

/** The page a stored list opens on, by its status. */
export function listPageAddress(list: Pick<PurchaseList, "id" | "status">) {
	return `${PAGE[list.status]}?id=${encodeURIComponent(list.id)}`;
}
