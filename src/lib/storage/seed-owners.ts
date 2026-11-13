import type { Repository } from "#lib/storage/repository"

import { DEFAULT_OWNERS } from "#lib/domain/owner"

export const OWNERS_SEED_KEY = "cc:migration:owner-records"

/**
 * Stores the three starting owners as records, once. Records already stored are left alone;
 * the marker then stops a later empty list from being seeded again.
 */
export async function seedOwners(repo: Repository, storage: Pick<Storage, "getItem" | "setItem">): Promise<void> {
	if (storage.getItem(OWNERS_SEED_KEY) !== null) return
	if ((await repo.listOwners()).length === 0) {
		for (const record of DEFAULT_OWNERS) await repo.saveOwner({ ...record })
	}
	storage.setItem(OWNERS_SEED_KEY, "done")
}
