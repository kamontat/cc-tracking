import { READY_SORTS, type ReadySort } from "#lib/domain/home";
import { OWNERS } from "#lib/domain/owner";
import {
	DEFAULT_READY_FILTER,
	type ReadyFilter,
} from "#lib/domain/ready-filter";

/** The new-list picker's state as its address keeps it (DD-103). */
export type ReadyView = { filter: ReadyFilter; sort: ReadySort };

export const DEFAULT_READY_VIEW: ReadyView = {
	filter: DEFAULT_READY_FILTER,
	sort: "room",
};

const manyOf = <T extends string>(known: readonly T[], values: string[]): T[] =>
	known.filter((k) => values.includes(k));

/** The `values` that are in `ids`, once each, in the address's order. */
const known = (ids: readonly string[], values: string[]): string[] =>
	[...new Set(values)].filter((value) => ids.includes(value));

/**
 * The picker's state from `/list/new?q=&loc=&owner=&sort=`; unknown values read as defaults.
 * A `loc` is kept only when it is one of `locationIds`, the stored records' ids.
 */
export function readReadyView(
	search: string,
	locationIds: readonly string[],
): ReadyView {
	const p = new URLSearchParams(search);
	const sort = p.get("sort");
	return {
		filter: {
			q: p.get("q") ?? "",
			locations: known(locationIds, p.getAll("loc")),
			owners: manyOf(OWNERS, p.getAll("owner")),
		},
		sort: READY_SORTS.includes(sort as ReadySort)
			? (sort as ReadySort)
			: DEFAULT_READY_VIEW.sort,
	};
}

/**
 * `/list/new`, then `?` and the fields that differ from the defaults, `loc` and `owner`
 * repeated. Never a `card`: that parameter opens the entering step instead.
 */
export function readyViewAddress(view: ReadyView): string {
	const p = new URLSearchParams();
	if (view.filter.q) p.set("q", view.filter.q);
	for (const l of view.filter.locations) p.append("loc", l);
	for (const o of view.filter.owners) p.append("owner", o);
	if (view.sort !== DEFAULT_READY_VIEW.sort) p.set("sort", view.sort);
	const text = p.toString();
	return text ? `/list/new?${text}` : "/list/new";
}

/** True when the address names cards: `/list/new?card=…` is the entering step, not the picker. */
export const namesCards = (search: string): boolean =>
	new URLSearchParams(search).has("card");
