import {
	CARDS_DIRS,
	CARDS_GROUPS,
	CARDS_SORTS,
	type CardsGroup,
	type CardsSort,
	type CardsView,
	DEFAULT_CARDS_VIEW,
} from "#lib/domain/cards-view"
import {
	DEFAULT_LIMITS_VIEW,
	LIMITS_DIRS,
	LIMITS_SORTS,
	type LimitsSort,
	type LimitsView,
} from "#lib/domain/limits-view"
import { OWNERS } from "#lib/domain/owner"
import { readDir } from "#lib/domain/sort"

const manyOf = <T extends string>(known: readonly T[], values: string[]): T[] => known.filter((k) => values.includes(k))

/** The `values` that are in `ids`, once each, in the address's order. */
const known = (ids: readonly string[], values: string[]): string[] =>
	[...new Set(values)].filter((value) => ids.includes(value))

/**
 * The Cards tab's state from `/cards?q=&f.locations=&f.owners=&sort=&dir=&by=` (RD-29);
 * unknown values read as defaults, and a missing `dir` as the sort's own (`CARDS_DIRS`). An
 * `f.locations` is kept only when it is one of `locationIds`, the stored records' ids.
 */
export function readCardsView(search: string, locationIds: readonly string[]): CardsView {
	const p = new URLSearchParams(search)
	const sort = p.get("sort")
	const field = CARDS_SORTS.includes(sort as CardsSort) ? (sort as CardsSort) : DEFAULT_CARDS_VIEW.sort
	return {
		q: p.get("q") ?? "",
		locations: known(locationIds, p.getAll("f.locations")),
		owners: manyOf(OWNERS, p.getAll("f.owners")),
		sort: field,
		dir: readDir(p.get("dir"), field, CARDS_DIRS),
		by: CARDS_GROUPS.includes(p.get("by") as CardsGroup) ? (p.get("by") as CardsGroup) : DEFAULT_CARDS_VIEW.by,
	}
}

/** `""` for the defaults, else `?` and the fields that differ, `f.locations` and `f.owners` repeated. */
export function writeCardsView(view: CardsView): string {
	const p = new URLSearchParams()
	if (view.q) p.set("q", view.q)
	for (const l of view.locations) p.append("f.locations", l)
	for (const o of view.owners) p.append("f.owners", o)
	if (view.sort !== DEFAULT_CARDS_VIEW.sort) p.set("sort", view.sort)
	if (view.dir !== CARDS_DIRS[view.sort]) p.set("dir", view.dir)
	if (view.by !== DEFAULT_CARDS_VIEW.by) p.set("by", view.by)
	const text = p.toString()
	return text ? `?${text}` : ""
}

/** The Limits tab (RD-22): Cards' second tab, every limit group. */
export const LIMITS_ADDRESS = "/cards/limits"

/** A limit group's panel on the Limits tab. */
export const limitAddress = (id: string): string => `${LIMITS_ADDRESS}?${new URLSearchParams({ limit: id })}`

/**
 * The Limits tab's state from `/cards/limits?q=&f.owners=&sort=&dir=` (RD-29); unknown values read
 * as defaults, and a missing `dir` as the sort's own (`LIMITS_DIRS`).
 */
export function readLimitsView(search: string): LimitsView {
	const p = new URLSearchParams(search)
	const sort = p.get("sort")
	const field = LIMITS_SORTS.includes(sort as LimitsSort) ? (sort as LimitsSort) : DEFAULT_LIMITS_VIEW.sort
	return {
		q: p.get("q") ?? "",
		owners: manyOf(OWNERS, p.getAll("f.owners")),
		sort: field,
		dir: readDir(p.get("dir"), field, LIMITS_DIRS),
	}
}

/** `""` for the defaults, else `?` and the fields that differ, `f.owners` repeated. */
export function writeLimitsView(view: LimitsView): string {
	const p = new URLSearchParams()
	if (view.q) p.set("q", view.q)
	for (const o of view.owners) p.append("f.owners", o)
	if (view.sort !== DEFAULT_LIMITS_VIEW.sort) p.set("sort", view.sort)
	if (view.dir !== LIMITS_DIRS[view.sort]) p.set("dir", view.dir)
	const text = p.toString()
	return text ? `?${text}` : ""
}
