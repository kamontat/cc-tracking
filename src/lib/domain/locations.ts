import type { Settings } from "#lib/domain/settings";
import type { Card, LocationRecord } from "#lib/domain/types";

const DEFAULTS: { id: string; name: string }[] = [
	{ id: "bangkok", name: "Bangkok" },
	{ id: "phichit", name: "Phichit" },
	{ id: "krabi", name: "Krabi" },
];

/**
 * The three places the app started with, as records. An empty purchase list is kept as
 * written: nowhere takes purchases.
 */
export function defaultLocations(settings: Settings): LocationRecord[] {
	return DEFAULTS.map(({ id, name }) => ({
		id,
		name,
		takesPurchases: settings.purchaseLocations.some((place) => place === id),
	}));
}

/**
 * A slug of `name` that no record in `existing` already uses. A name with no ASCII letters
 * or digits (Thai only, say) falls back to `location`.
 */
export function locationId(name: string, existing: LocationRecord[]): string {
	const slug =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "location";
	const taken = new Set(existing.map((record) => record.id));
	if (!taken.has(slug)) return slug;
	let n = 2;
	while (taken.has(`${slug}-${n}`)) n++;
	return `${slug}-${n}`;
}

/** Changes the name only; the id stays, since cards refer to it. Returns a new array. */
export function renameLocation(
	records: LocationRecord[],
	id: string,
	name: string,
): LocationRecord[] {
	return records.map((record) =>
		record.id === id ? { ...record, name } : record,
	);
}

/** False while any card, archived included, is kept at `id`. */
export function canDeleteLocation(id: string, cards: Card[]): boolean {
	return !cards.some((card) => card.location === id);
}

export function takesPurchases(records: LocationRecord[], id: string): boolean {
	return records.find((record) => record.id === id)?.takesPurchases ?? false;
}
