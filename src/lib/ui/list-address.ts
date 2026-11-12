import type { PurchaseList } from "#lib/domain/types"

/**
 * Each case of a purchase list has its own page, so a link says what it opens: a new list
 * (`/list/new`), a draft to edit (`/list/draft`), the spender's reply to a waiting list
 * (`/list/reply`) and a saved list (`/list/view`).
 */
const PAGE: Record<PurchaseList["status"], string> = {
	draft: "/list/draft",
	sent: "/list/reply",
	saved: "/list/view",
}

/**
 * A new purchase list for `cardIds`, one `card` parameter each, in the order given. Any other
 * parameter in `search` is kept, ahead of the cards.
 */
export function newListAddress(cardIds: string[], search = ""): string {
	const query = new URLSearchParams(search)
	query.delete("card")
	for (const id of cardIds) query.append("card", id)
	const text = query.toString()
	return text ? `/list/new?${text}` : "/list/new"
}

/** The page a stored list opens on, by its status. */
export function listPageAddress(list: Pick<PurchaseList, "id" | "status">) {
	return `${PAGE[list.status]}?id=${encodeURIComponent(list.id)}`
}

/**
 * The add-a-card sheet over a new list or a draft: its picker (`add=1`), or one card's orders
 * (`open=<card id>`), which wins when both are there. Null when no sheet is open.
 */
export type ListSheet = { kind: "pick" } | { kind: "card"; cardId: string } | null

export function readListSheet(search: string): ListSheet {
	const query = new URLSearchParams(search)
	const cardId = query.get("open")
	if (cardId) return { kind: "card", cardId }
	return query.has("add") ? { kind: "pick" } : null
}

/** `path` with `search`'s other keys kept and the sheet's key written after them. */
export function listSheetAddress(path: string, search: string, sheet: ListSheet): string {
	const query = new URLSearchParams(search)
	query.delete("add")
	query.delete("open")
	if (sheet?.kind === "pick") query.set("add", "1")
	if (sheet?.kind === "card") query.set("open", sheet.cardId)
	const text = query.toString()
	return text ? `${path}?${text}` : path
}

/** The `id` of the stored list a page opens, or null when the address has none. */
export const listId = (search: string): string | null => new URLSearchParams(search).get("id")
