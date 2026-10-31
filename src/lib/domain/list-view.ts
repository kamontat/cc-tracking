import { LOCATIONS, type Location } from "#lib/domain/location";
import { cardOwnerOf, OWNERS, type Owner, ownerOf } from "#lib/domain/owner";
import type { Card, LimitGroup } from "#lib/domain/types";

export type SortDirection = "asc" | "desc";

export const CARD_SORTS = [
	"default",
	"name",
	"location",
	"group",
	"closeDay",
] as const;
export type CardSort = (typeof CARD_SORTS)[number];

export const GROUP_SORTS = [
	"default",
	"name",
	"owner",
	"limit",
	"cards",
	"used",
	"available",
] as const;
export type GroupSort = (typeof GROUP_SORTS)[number];

/** The limit group filter value for cards that point at no group at all. */
export const UNASSIGNED = "none";

/**
 * What the reader has narrowed the card list to, and in which order. An empty string on a
 * filter means "any"; `group` is a group id or `UNASSIGNED`.
 */
export type CardView = {
	q: string;
	owner: Owner | "";
	location: Location | "";
	group: string;
	sort: CardSort;
	dir: SortDirection;
};

export type GroupView = {
	q: string;
	owner: Owner | "";
	sort: GroupSort;
	dir: SortDirection;
};

export const DEFAULT_CARD_VIEW: CardView = {
	q: "",
	owner: "",
	location: "",
	group: "",
	sort: "default",
	dir: "asc",
};

export const DEFAULT_GROUP_VIEW: GroupView = {
	q: "",
	owner: "",
	sort: "default",
	dir: "asc",
};

// Numeric, so "Card 2" sorts before "Card 10"; base sensitivity, so case does not split names.
const collator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

const byName = (a: { name: string }, b: { name: string }) =>
	collator.compare(a.name, b.name);

/**
 * The one order every limit group dropdown lists its groups in: owner first, in `OWNERS`
 * order, then name. A reader scanning for their own account finds all of it in one run.
 */
export function byOwnerThenName(a: LimitGroup, b: LimitGroup): number {
	return (
		OWNERS.indexOf(ownerOf(a)) - OWNERS.indexOf(ownerOf(b)) || byName(a, b)
	);
}

const matches = (query: string, fields: (string | undefined)[]) => {
	const needle = query.trim().toLocaleLowerCase();
	return (
		needle === "" ||
		fields.some((field) => field?.toLocaleLowerCase().includes(needle))
	);
};

/**
 * Sorts a copy of `list` by `compare`, or leaves it in its stored order under "default".
 * Array sort is stable, so reversing the comparator (rather than the result) keeps equal
 * items in the order `compare`'s own tie-breaks put them.
 */
const ordered = <T>(
	list: T[],
	sort: string,
	dir: SortDirection,
	compare: (a: T, b: T) => number,
): T[] =>
	sort === "default"
		? list
		: [...list].sort((a, b) => (dir === "desc" ? -1 : 1) * compare(a, b));

/** The cards `view` lets through, in the order it asks for. Never mutates `cards`. */
export function applyCardView(
	cards: Card[],
	groups: LimitGroup[],
	view: CardView,
): Card[] {
	const groupById = new Map(groups.map((group) => [group.id, group]));
	const groupOf = (card: Card) =>
		(card.limitGroupId && groupById.get(card.limitGroupId)) || null;
	// A group deleted since the link was made filters nothing, the same as the dropdown, which
	// has no option for it and so shows "any".
	const groupFilter =
		view.group === UNASSIGNED || groupById.has(view.group) ? view.group : "";

	const kept = cards.filter((card) => {
		const group = groupOf(card);
		return (
			matches(view.q, [card.name, card.id, card.last4, card.comment]) &&
			(view.owner === "" || cardOwnerOf(card, group) === view.owner) &&
			(view.location === "" || card.location === view.location) &&
			(groupFilter === "" ||
				(groupFilter === UNASSIGNED
					? group === null
					: group?.id === groupFilter))
		);
	});

	const rank = new Map(
		[...groups].sort(byOwnerThenName).map((group, index) => [group.id, index]),
	);
	const groupRank = (card: Card) => {
		const group = groupOf(card);
		return group ? (rank.get(group.id) ?? 0) : groups.length;
	};
	const primary: Record<
		Exclude<CardSort, "default">,
		(card: Card) => number
	> = {
		name: () => 0,
		location: (card) => LOCATIONS.indexOf(card.location),
		group: groupRank,
		closeDay: (card) => card.cycle.closeDay,
	};

	return ordered(kept, view.sort, view.dir, (a, b) => {
		const key = view.sort === "default" ? primary.name : primary[view.sort];
		return key(a) - key(b) || byName(a, b);
	});
}

/**
 * The groups `view` lets through, in the order it asks for. `usage` is satang spent per id,
 * `counts` the cards pointing at each id.
 */
export function applyGroupView(
	groups: LimitGroup[],
	usage: Record<string, number>,
	view: GroupView,
	counts: Record<string, number> = {},
): LimitGroup[] {
	const used = (group: LimitGroup) => usage[group.id] ?? 0;
	const kept = groups.filter(
		(group) =>
			matches(view.q, [group.name]) &&
			(view.owner === "" || ownerOf(group) === view.owner),
	);
	const primary: Record<
		Exclude<GroupSort, "default">,
		(group: LimitGroup) => number
	> = {
		name: () => 0,
		owner: (group) => OWNERS.indexOf(ownerOf(group)),
		limit: (group) => group.limit,
		cards: (group) => counts[group.id] ?? 0,
		used,
		available: (group) => group.limit - used(group),
	};
	return ordered(kept, view.sort, view.dir, (a, b) => {
		const key = view.sort === "default" ? primary.name : primary[view.sort];
		return key(a) - key(b) || byName(a, b);
	});
}

/**
 * The view after a click on the header that sorts by `key`: a fresh column starts ascending,
 * a second click reverses it, and a third hands the list back to its saved order.
 */
export function nextSort<V extends { sort: string; dir: SortDirection }>(
	view: V,
	key: V["sort"],
): V {
	if (view.sort !== key) return { ...view, sort: key, dir: "asc" };
	if (view.dir === "asc") return { ...view, dir: "desc" };
	return { ...view, sort: "default", dir: "asc" };
}
