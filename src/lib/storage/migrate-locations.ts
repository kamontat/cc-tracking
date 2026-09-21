import { DEFAULT_LOCATION, toLocation } from "#lib/domain/location";
import type { Repository } from "#lib/storage/repository";

export const MIGRATION_KEY = "cc:migration:location";

/**
 * Rewrites any stored location the closed set does not recognise, once.
 *
 * `Card.location` is typed as `Location`, so the guard below looks like dead code. It is
 * not: cards written before the field became a closed set still hold free text, and this
 * is the one place that reads them honestly rather than trusting the type. Coercing on
 * every read instead would leave the type asserting something about stored data that is
 * not true, and would re-fix the same cards forever.
 *
 * Returns the names of the cards it reset, and records them under `MIGRATION_KEY` so the
 * cards page can say which ones need a human to pick the right location.
 */
export async function migrateLocations(
	repo: Repository,
	storage: Storage,
): Promise<string[]> {
	const reset: string[] = [];

	for (const card of await repo.listCards()) {
		if (toLocation(card.location) !== null) continue;
		try {
			await repo.saveCard({ ...card, location: DEFAULT_LOCATION });
			reset.push(card.name);
		} catch (failure) {
			// One card that will not write must not hold back the rest, nor the page behind it.
			console.error(failure);
		}
	}

	if (reset.length > 0) {
		try {
			storage.setItem(MIGRATION_KEY, JSON.stringify(reset));
		} catch (failure) {
			console.error(failure);
		}
	}

	return reset;
}

/** Reads the names `migrateLocations` recorded and clears them, so the notice shows once. */
export function takeResetNotice(storage: Storage): string[] {
	let raw: string | null;
	try {
		raw = storage.getItem(MIGRATION_KEY);
		storage.removeItem(MIGRATION_KEY);
	} catch (failure) {
		console.error(failure);
		return [];
	}
	if (raw === null) return [];

	try {
		const value: unknown = JSON.parse(raw);
		return Array.isArray(value)
			? value.filter((name): name is string => typeof name === "string")
			: [];
	} catch {
		return [];
	}
}
