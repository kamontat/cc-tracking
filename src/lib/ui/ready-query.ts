import { READY_DIRS, READY_SORTS, type ReadySort } from "#lib/domain/home"
import { OWNERS } from "#lib/domain/owner"
import { DEFAULT_READY_FILTER, READY_GROUPS, type ReadyFilter, type ReadyGroup } from "#lib/domain/ready-filter"
import { readDir, type SortDir } from "#lib/domain/sort"

/** The new-list picker's state as its address keeps it (DD-103). */
export type ReadyView = { filter: ReadyFilter; sort: ReadySort; dir: SortDir; by: ReadyGroup }

export const DEFAULT_READY_VIEW: ReadyView = {
	filter: DEFAULT_READY_FILTER,
	sort: "room",
	dir: READY_DIRS.room,
	by: "none",
}

const manyOf = <T extends string>(known: readonly T[], values: string[]): T[] => known.filter((k) => values.includes(k))

/** The `values` that are in `ids`, once each, in the address's order. */
const known = (ids: readonly string[], values: string[]): string[] =>
	[...new Set(values)].filter((value) => ids.includes(value))

/**
 * The picker's state from `/list/new?q=&loc=&owner=&sort=&dir=&by=`; unknown values read as defaults,
 * and a missing `dir` as the sort's own (`READY_DIRS`).
 * A `loc` is kept only when it is one of `locationIds`, the stored records' ids.
 */
export function readReadyView(search: string, locationIds: readonly string[]): ReadyView {
	const p = new URLSearchParams(search)
	const sort = p.get("sort")
	const field = READY_SORTS.includes(sort as ReadySort) ? (sort as ReadySort) : DEFAULT_READY_VIEW.sort
	return {
		filter: {
			q: p.get("q") ?? "",
			locations: known(locationIds, p.getAll("loc")),
			owners: manyOf(OWNERS, p.getAll("owner")),
		},
		sort: field,
		dir: readDir(p.get("dir"), field, READY_DIRS),
		by: READY_GROUPS.includes(p.get("by") as ReadyGroup) ? (p.get("by") as ReadyGroup) : DEFAULT_READY_VIEW.by,
	}
}

/**
 * `/list/new`, then `?` and the fields that differ from the defaults, `loc` and `owner`
 * repeated. Never a `card`: that parameter opens the entering step instead.
 */
export function readyViewAddress(view: ReadyView): string {
	const p = new URLSearchParams()
	if (view.filter.q) p.set("q", view.filter.q)
	for (const l of view.filter.locations) p.append("loc", l)
	for (const o of view.filter.owners) p.append("owner", o)
	if (view.sort !== DEFAULT_READY_VIEW.sort) p.set("sort", view.sort)
	if (view.dir !== READY_DIRS[view.sort]) p.set("dir", view.dir)
	if (view.by !== DEFAULT_READY_VIEW.by) p.set("by", view.by)
	const text = p.toString()
	return text ? `/list/new?${text}` : "/list/new"
}

/** True when the address names cards: `/list/new?card=…` is the entering step, not the picker. */
export const namesCards = (search: string): boolean => new URLSearchParams(search).has("card")
