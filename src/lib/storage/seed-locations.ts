import type { Repository } from "#lib/storage/repository"

import { defaultLocations } from "#lib/domain/locations"

export const SEED_KEY = "cc:migration:location-records"

/**
 * Stores the three starting locations as records, once. The tick on each comes from the
 * saved purchase-location setting, so nobody loses where they were buying. Records already
 * stored are left alone; the marker then stops a later empty list (everything deleted) from
 * being seeded again.
 */
export async function seedLocations(repo: Repository, storage: Pick<Storage, "getItem" | "setItem">): Promise<void> {
	if (storage.getItem(SEED_KEY) !== null) return
	if ((await repo.listLocations()).length === 0) {
		for (const record of defaultLocations(await repo.getSettings())) {
			await repo.saveLocation(record)
		}
	}
	storage.setItem(SEED_KEY, "done")
}
