import {
	CARDS_SORTS,
	type CardsSort,
	type CardsView,
	DEFAULT_CARDS_VIEW,
} from "#lib/domain/cards-view";
import { OWNERS } from "#lib/domain/owner";

const manyOf = <T extends string>(known: readonly T[], values: string[]): T[] =>
	known.filter((k) => values.includes(k));

/** The `values` that are in `ids`, once each, in the address's order. */
const known = (ids: readonly string[], values: string[]): string[] =>
	[...new Set(values)].filter((value) => ids.includes(value));

/**
 * The Cards page's state from `/cards?q=&loc=&owner=&sort=`; unknown values read as defaults.
 * A `loc` is kept only when it is one of `locationIds`, the stored records' ids.
 */
export function readCardsView(
	search: string,
	locationIds: readonly string[],
): CardsView {
	const p = new URLSearchParams(search);
	const sort = p.get("sort");
	return {
		q: p.get("q") ?? "",
		locations: known(locationIds, p.getAll("loc")),
		owners: manyOf(OWNERS, p.getAll("owner")),
		sort: CARDS_SORTS.includes(sort as CardsSort)
			? (sort as CardsSort)
			: DEFAULT_CARDS_VIEW.sort,
	};
}

/** `""` for the defaults, else `?` and the fields that differ, `loc` and `owner` repeated. */
export function writeCardsView(view: CardsView): string {
	const p = new URLSearchParams();
	if (view.q) p.set("q", view.q);
	for (const l of view.locations) p.append("loc", l);
	for (const o of view.owners) p.append("owner", o);
	if (view.sort !== DEFAULT_CARDS_VIEW.sort) p.set("sort", view.sort);
	const text = p.toString();
	return text ? `?${text}` : "";
}

/** The group the sheet is open on: its id, `"new"` for a blank one, or `null` when closed. */
export function readGroupSheet(search: string): string | "new" | null {
	const group = new URLSearchParams(search).get("group");
	return group === null || group === "" ? null : group;
}

/**
 * The query string with the sheet opened on a group (`?group=<id>`, `"new"` for a blank one)
 * or, for `null`, closed. Every other key is kept as it was.
 */
export function groupSheetAddress(search: string, id: string | null): string {
	const p = new URLSearchParams(search);
	p.delete("group");
	if (id !== null) p.set("group", id);
	const text = p.toString();
	return text ? `?${text}` : "";
}
