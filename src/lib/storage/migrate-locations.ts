import { DEFAULT_LOCATION } from "#lib/domain/location";
import { defaultLocations } from "#lib/domain/locations";
import type { LocationRecord } from "#lib/domain/types";
import type { Repository } from "#lib/storage/repository";

export const MIGRATION_KEY = "cc:migration:location";

/**
 * Points every card at a stored location record, once per load.
 *
 * Cards written before the field was a closed set still hold free text, a version 2 backup
 * can bring cards without their records, and a default record can have gone. So each card is
 * checked against the stored record ids: one kept at a default place whose record is missing
 * (`bangkok`, `phichit`, `krabi`) gets that default record back, taking no purchases; any
 * other unknown value moves the card to the `DEFAULT_LOCATION` record when stored, else to the
 * first record by id, so the result never depends on the reader's language.
 *
 * Returns the names of the cards it moved, and records them under `MIGRATION_KEY` so the
 * cards page can say which ones need a human to pick the right location.
 */
export async function migrateLocations(
	repo: Repository,
	storage: Storage,
): Promise<string[]> {
	const reset: string[] = [];
	const records = await repo.listLocations();
	const defaults = defaultLocations({ purchaseLocations: [] });

	/** Saves a default record back, and counts it as stored from here on. */
	const restore = async (record: LocationRecord) => {
		await repo.saveLocation(record);
		records.push(record);
	};

	for (const card of await repo.listCards()) {
		if (records.some((record) => record.id === card.location)) continue;
		try {
			const lost = defaults.find((record) => record.id === card.location);
			if (lost) {
				await restore(lost);
				continue;
			}
			// With no record at all, the old default place comes back to hold the card.
			const fallback = defaults.find(
				(record) => record.id === DEFAULT_LOCATION,
			);
			if (records.length === 0 && fallback) await restore(fallback);
			const target =
				records.find((record) => record.id === DEFAULT_LOCATION) ??
				records.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
			if (!target) continue;
			await repo.saveCard({ ...card, location: target.id });
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
