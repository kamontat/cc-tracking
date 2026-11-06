import type { Repository } from "#lib/storage/repository"

import { assignColors } from "#lib/domain/group-color"

/** Where `migrateGroupColors` records that it finished, so it never runs again. */
export const GROUP_COLORS_MIGRATION_KEY = "cc:migration:group-colors"

/**
 * Saves a colour on every stored limit group that lacks a valid one, and returns how many it
 * saved. Groups go in stored order, so the first four keep the colours they wore before the
 * choice was stored.
 */
export async function assignGroupColors(repo: Repository, random?: () => number): Promise<number> {
	const changed = assignColors(await repo.listLimitGroups(), random)
	for (const group of changed) await repo.saveLimitGroup(group)
	return changed.length
}

/**
 * The once-only startup step: colours the groups stored before the field existed, then sets
 * the marker. A group made or restored later gets its colour where it is saved.
 */
export async function migrateGroupColors(
	repo: Repository,
	storage: Pick<Storage, "getItem" | "setItem">,
): Promise<number> {
	if (storage.getItem(GROUP_COLORS_MIGRATION_KEY) !== null) return 0
	const count = await assignGroupColors(repo)
	storage.setItem(GROUP_COLORS_MIGRATION_KEY, "done")
	return count
}
