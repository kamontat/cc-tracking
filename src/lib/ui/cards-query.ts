import {
	CARDS_DIRS,
	CARDS_GROUPS,
	CARDS_SORTS,
	CARDS_STATES,
	CARDS_USAGES,
	type CardFilter,
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
import { DEFAULT_OWNERS } from "#lib/domain/owner"
import { readDir } from "#lib/domain/sort"

/** The starting owners' ids, for a caller that has no stored owners to hand. */
const STARTING_OWNER_IDS = DEFAULT_OWNERS.map((owner) => owner.id)

/** The `values` that are in `ids`, once each, in the address's order. */
const known = (ids: readonly string[], values: string[]): string[] =>
	[...new Set(values)].filter((value) => ids.includes(value))

/**
 * The search and the `f.locations` and `f.owners` filters every list of cards shares (Cards,
 * Home's _Owed_ and _Ready to use_, RD-29). An `f.locations` is kept only when it is one of
 * `locationIds`, and an `f.owners` when it is one of `ownerIds`, the stored records' ids.
 */
export function readCardFilter(
	p: URLSearchParams,
	locationIds: readonly string[],
	ownerIds: readonly string[] = STARTING_OWNER_IDS,
): CardFilter {
	return {
		q: p.get("q") ?? "",
		locations: known(locationIds, p.getAll("f.locations")),
		owners: known(ownerIds, p.getAll("f.owners")),
	}
}

/** Sets `q` when there is one, then each location and owner, repeated. */
export function writeCardFilter(p: URLSearchParams, filter: CardFilter): void {
	if (filter.q) p.set("q", filter.q)
	for (const l of filter.locations) p.append("f.locations", l)
	for (const o of filter.owners) p.append("f.owners", o)
}

/**
 * The Cards tab's state from `/cards?q=&f.locations=&f.owners=&f.usage=&f.states=&sort=&dir=&by=` (RD-29);
 * unknown values read as defaults, and a missing `dir` as the sort's own (`CARDS_DIRS`). An
 * `f.locations` is kept only when it is one of `locationIds`, an `f.owners` one of `ownerIds`;
 * `f.usage` and `f.states` read in `CARDS_USAGES`' and `CARDS_STATES`' order, once each.
 */
export function readCardsView(
	search: string,
	locationIds: readonly string[],
	ownerIds: readonly string[] = STARTING_OWNER_IDS,
): CardsView {
	const p = new URLSearchParams(search)
	const sort = p.get("sort")
	const field = CARDS_SORTS.includes(sort as CardsSort) ? (sort as CardsSort) : DEFAULT_CARDS_VIEW.sort
	const usage = p.getAll("f.usage")
	const states = p.getAll("f.states")
	return {
		...readCardFilter(p, locationIds, ownerIds),
		usage: CARDS_USAGES.filter((value) => usage.includes(value)),
		states: CARDS_STATES.filter((value) => states.includes(value)),
		sort: field,
		dir: readDir(p.get("dir"), field, CARDS_DIRS),
		by: CARDS_GROUPS.includes(p.get("by") as CardsGroup) ? (p.get("by") as CardsGroup) : DEFAULT_CARDS_VIEW.by,
	}
}

/** `""` for the defaults, else `?` and the fields that differ, `f.locations`, `f.owners`, `f.usage` and `f.states` repeated. */
export function writeCardsView(view: CardsView): string {
	const p = new URLSearchParams()
	writeCardFilter(p, view)
	for (const usage of view.usage) p.append("f.usage", usage)
	for (const state of view.states) p.append("f.states", state)
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
 * as defaults, and a missing `dir` as the sort's own (`LIMITS_DIRS`). An `f.owners` is kept only
 * when it is one of `ownerIds`, the stored records' ids.
 */
export function readLimitsView(search: string, ownerIds: readonly string[] = STARTING_OWNER_IDS): LimitsView {
	const p = new URLSearchParams(search)
	const sort = p.get("sort")
	const field = LIMITS_SORTS.includes(sort as LimitsSort) ? (sort as LimitsSort) : DEFAULT_LIMITS_VIEW.sort
	return {
		q: p.get("q") ?? "",
		owners: known(ownerIds, p.getAll("f.owners")),
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
