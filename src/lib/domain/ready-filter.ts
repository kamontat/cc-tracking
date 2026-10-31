import type { ReadyRow } from "#lib/domain/home";
import { LOCATIONS, type Location } from "#lib/domain/location";
import { cardOwnerOf, OWNERS, type Owner } from "#lib/domain/owner";

/**
 * What the new-list picker narrows *Ready to use* by (DD-103): a search over each card's id,
 * name and last 4, the places the cards are kept in and the account holders. An empty list
 * means "any".
 */
export type ReadyFilter = {
	q: string;
	locations: Location[];
	owners: Owner[];
};

export const DEFAULT_READY_FILTER: ReadyFilter = {
	q: "",
	locations: [],
	owners: [],
};

/** Who holds a ready card: its own owner when supplementary, else its group's (`cardOwnerOf`). */
export function readyOwnerOf(row: ReadyRow): Owner | null {
	return cardOwnerOf(row.card, row.room.group);
}

/** The places the ready cards are kept in, in the fixed order of `LOCATIONS`. */
export function readyLocations(rows: ReadyRow[]): Location[] {
	const kept = new Set(rows.map((row) => row.card.location));
	return LOCATIONS.filter((location) => kept.has(location));
}

/** The account holders of the ready cards, in the fixed order of `OWNERS`. */
export function readyOwners(rows: ReadyRow[]): Owner[] {
	const held = new Set(rows.map(readyOwnerOf));
	return OWNERS.filter((owner) => held.has(owner));
}

/** True when the query (trimmed, any case) is in the card's id, name or last 4, or is empty. */
export function matchesReady(row: ReadyRow, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q === "") return true;
	const { id, name, last4 } = row.card;
	return [id, name, last4].some((value) => value.toLowerCase().includes(q));
}

/** The rows the filter keeps, in the order given. */
export function filterReady(rows: ReadyRow[], filter: ReadyFilter): ReadyRow[] {
	return rows.filter((row) => {
		if (
			filter.locations.length > 0 &&
			!filter.locations.includes(row.card.location)
		)
			return false;
		if (filter.owners.length > 0) {
			const owner = readyOwnerOf(row);
			if (!owner || !filter.owners.includes(owner)) return false;
		}
		return matchesReady(row, filter.q);
	});
}

/** How many filters are in use, for the Filter button's badge; the search box shows its own. */
export function readyFilterCount(filter: ReadyFilter): number {
	return filter.locations.length + filter.owners.length;
}
