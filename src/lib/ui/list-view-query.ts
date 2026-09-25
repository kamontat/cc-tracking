import {
	CARD_SORTS,
	type CardView,
	DEFAULT_CARD_VIEW,
	DEFAULT_GROUP_VIEW,
	GROUP_SORTS,
	type GroupView,
	type SortDirection,
} from "#lib/domain/list-view";
import { toLocation } from "#lib/domain/location";
import { toOwner } from "#lib/domain/owner";

export type Views = { cards: CardView; groups: GroupView };

const oneOf = <T extends string>(
	known: readonly T[],
	value: string | null,
	fallback: T,
): T =>
	(known as readonly (string | null)[]).includes(value)
		? (value as T)
		: fallback;

const toDir = (value: string | null): SortDirection =>
	oneOf(["asc", "desc"], value, "asc");

/**
 * The cards page's two list views, read from its query string. Anything a hand-edited or
 * stale link carries that is not a known value reads as that field's default.
 */
export function readViews(params: URLSearchParams): Views {
	return {
		cards: {
			q: params.get("q") ?? "",
			owner: toOwner(params.get("owner")) ?? "",
			location: toLocation(params.get("loc")) ?? "",
			group: params.get("group") ?? "",
			sort: oneOf(CARD_SORTS, params.get("sort"), DEFAULT_CARD_VIEW.sort),
			dir: toDir(params.get("dir")),
		},
		groups: {
			q: params.get("gq") ?? "",
			owner: toOwner(params.get("gowner")) ?? "",
			sort: oneOf(GROUP_SORTS, params.get("gsort"), DEFAULT_GROUP_VIEW.sort),
			dir: toDir(params.get("gdir")),
		},
	};
}

/**
 * A copy of `params` carrying `views`. A field at its default is left out, so an untouched
 * page keeps a bare URL; keys this does not own (`edit`, say) pass through unchanged.
 */
export function writeViews(
	params: URLSearchParams,
	{ cards, groups }: Views,
): URLSearchParams {
	const next = new URLSearchParams(params);
	const entries: [string, string, string][] = [
		["q", cards.q, DEFAULT_CARD_VIEW.q],
		["owner", cards.owner, DEFAULT_CARD_VIEW.owner],
		["loc", cards.location, DEFAULT_CARD_VIEW.location],
		["group", cards.group, DEFAULT_CARD_VIEW.group],
		["sort", cards.sort, DEFAULT_CARD_VIEW.sort],
		["dir", cards.dir, DEFAULT_CARD_VIEW.dir],
		["gq", groups.q, DEFAULT_GROUP_VIEW.q],
		["gowner", groups.owner, DEFAULT_GROUP_VIEW.owner],
		["gsort", groups.sort, DEFAULT_GROUP_VIEW.sort],
		["gdir", groups.dir, DEFAULT_GROUP_VIEW.dir],
	];
	for (const [key, value, fallback] of entries) {
		if (value === fallback) next.delete(key);
		else next.set(key, value);
	}
	return next;
}
