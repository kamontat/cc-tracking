import { CARDS_DIRS, CARDS_SORTS, type CardsSort, type CardsView, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view"
import { OWNERS } from "#lib/domain/owner"
import { readDir } from "#lib/domain/sort"

const manyOf = <T extends string>(known: readonly T[], values: string[]): T[] => known.filter((k) => values.includes(k))

/** The `values` that are in `ids`, once each, in the address's order. */
const known = (ids: readonly string[], values: string[]): string[] =>
	[...new Set(values)].filter((value) => ids.includes(value))

/**
 * The Cards page's state from `/cards?q=&loc=&owner=&ungrouped=&sort=&dir=`; unknown values read as
 * defaults, and a missing `dir` as the sort's own (`CARDS_DIRS`).
 * A `loc` is kept only when it is one of `locationIds`, the stored records' ids.
 */
export function readCardsView(search: string, locationIds: readonly string[]): CardsView {
	const p = new URLSearchParams(search)
	const sort = p.get("sort")
	const field = CARDS_SORTS.includes(sort as CardsSort) ? (sort as CardsSort) : DEFAULT_CARDS_VIEW.sort
	return {
		q: p.get("q") ?? "",
		locations: known(locationIds, p.getAll("loc")),
		owners: manyOf(OWNERS, p.getAll("owner")),
		ungrouped: p.get("ungrouped") === "1",
		sort: field,
		dir: readDir(p.get("dir"), field, CARDS_DIRS),
	}
}

/** What the Cards page shows below 900px: the cards, or the limit groups (`?view=groups`). */
export type CardsShow = "cards" | "groups"

/** The phone view from the address; anything but `?view=groups` reads as the cards. */
export function readCardsShow(search: string): CardsShow {
	return new URLSearchParams(search).get("view") === "groups" ? "groups" : "cards"
}

/**
 * `""` for the defaults, else `?` and the fields that differ, `loc` and `owner` repeated, and
 * `view=groups` first when the phone view shows the groups.
 */
export function writeCardsView(view: CardsView, show: CardsShow = "cards"): string {
	const p = new URLSearchParams()
	if (show === "groups") p.set("view", "groups")
	if (view.q) p.set("q", view.q)
	for (const l of view.locations) p.append("loc", l)
	for (const o of view.owners) p.append("owner", o)
	if (view.ungrouped) p.set("ungrouped", "1")
	if (view.sort !== DEFAULT_CARDS_VIEW.sort) p.set("sort", view.sort)
	if (view.dir !== CARDS_DIRS[view.sort]) p.set("dir", view.dir)
	const text = p.toString()
	return text ? `?${text}` : ""
}

/** What `readGroupSheet` returns for the blank sheet, which no group id can equal. */
export const NEW_GROUP = Symbol("new group")

/**
 * The group the sheet is open on: its id (`?group=<id>`, any string, `new` included),
 * `NEW_GROUP` for a blank one (`?newGroup=1`), or `null` when closed.
 */
export function readGroupSheet(search: string): string | typeof NEW_GROUP | null {
	const p = new URLSearchParams(search)
	if (p.get("newGroup") === "1") return NEW_GROUP
	const group = p.get("group")
	return group === null || group === "" ? null : group
}

/**
 * The query string with the sheet opened on a group (`?group=<id>`, `NEW_GROUP` for a blank
 * one as `?newGroup=1`) or, for `null`, closed. Every other key is kept as it was.
 */
export function groupSheetAddress(search: string, id: string | typeof NEW_GROUP | null): string {
	const p = new URLSearchParams(search)
	p.delete("group")
	p.delete("newGroup")
	if (id === NEW_GROUP) p.set("newGroup", "1")
	else if (id !== null) p.set("group", id)
	const text = p.toString()
	return text ? `?${text}` : ""
}
