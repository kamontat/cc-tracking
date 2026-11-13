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

/**
 * The add-a-card sheet over the builder: its picker, or one card's orders. Null when no sheet is
 * open. Not in the address (DD-195 as amended by RD-26).
 */
export type ListSheet = { kind: "pick" } | { kind: "card"; cardId: string } | null
