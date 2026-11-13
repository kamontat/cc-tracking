import type { PurchaseList } from "#lib/domain/types"

import { LISTS_ADDRESS } from "#lib/ui/tx-query"

/**
 * A purchase list's addresses (RD-26), under the Lists tab's path: a new list is the builder
 * (`/transactions/lists/new?cards=…`), a draft or a waiting list is worked on at
 * `/transactions/lists/edit?list=<id>` (the builder on a draft, the reply on a waiting list), and
 * a saved list has only its panel on the Lists tab (`/transactions/lists?list=<id>`).
 */
export const NEW_LIST_ADDRESS = `${LISTS_ADDRESS}/new`
export const EDIT_LIST_ADDRESS = `${LISTS_ADDRESS}/edit`

const withQuery = (path: string, query: URLSearchParams) => {
	const text = query.toString()
	return text ? `${path}?${text}` : path
}

/** A new purchase list for `cardIds`, one `cards` key each, in the order given. */
export function newListAddress(cardIds: string[]): string {
	const query = new URLSearchParams()
	for (const id of cardIds) query.append("cards", id)
	return withQuery(NEW_LIST_ADDRESS, query)
}

/** Where a draft or a waiting list is worked on. */
export const listEditAddress = (id: string) => withQuery(EDIT_LIST_ADDRESS, new URLSearchParams({ list: id }))

/** The Lists tab with the list open in its panel. */
export const listPanelAddress = (id: string) => withQuery(LISTS_ADDRESS, new URLSearchParams({ list: id }))

/** Where a link to a stored list goes: a draft or a waiting list to its edit page, a saved list to its panel. */
export function listPageAddress(list: Pick<PurchaseList, "id" | "status">) {
	return list.status === "saved" ? listPanelAddress(list.id) : listEditAddress(list.id)
}

/** The `list` the edit page works on, or null when the address has none. */
export const listKey = (search: string): string | null => new URLSearchParams(search).get("list") || null

/*
 * The old list pages (`/list/new`, `/list/draft`, `/list/reply`, `/list/view`) still build and
 * work, on their old keys, until they retire (RD-26): a new list's `card`, a stored list's `id`,
 * and the add-a-card sheet in the address (`add`, `open`, DD-195).
 */

/** The old `/list/new` for `cardIds`, one `card` each; any other key in `search` is kept ahead. */
export function legacyListAddress(cardIds: string[], search = ""): string {
	const query = new URLSearchParams(search)
	query.delete("card")
	for (const id of cardIds) query.append("card", id)
	return withQuery("/list/new", query)
}

/**
 * The add-a-card sheet over an old new-list or draft page: its picker (`add=1`), or one card's
 * orders (`open=<card id>`), which wins when both are there. Null when no sheet is open.
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
	return withQuery(path, query)
}

/** The `id` of the stored list an old page opens, or null when the address has none. */
export const listId = (search: string): string | null => new URLSearchParams(search).get("id")
