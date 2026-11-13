import type { Owner } from "#lib/domain/owner"
import type { OwnerRecord } from "#lib/domain/types"
import type { Repository } from "#lib/storage/repository"

import { DEFAULT_OWNER, DEFAULT_OWNERS, sortOwners } from "#lib/domain/owner"

/**
 * Points every limit group, and every supplementary card with an owner of its own, at a stored
 * owner record, once per load and after a restore (DC-18).
 *
 * A group with no owner is the default's (KC). An owner that is one of the starting three
 * (KC, NT, RI) whose record has gone gets that record back. Any other unknown owner moves to
 * the first stored owner A to Z by name, or to KC's record, brought back, when none is stored.
 * An owner left on a card that is not supplementary is never read (DC-09), so it stays.
 */
export async function migrateOwners(repo: Repository): Promise<void> {
	const records = await repo.listOwners()

	/** The stored owner `value` lands on, saving a starting record back when it must. */
	const resolve = async (value: Owner): Promise<Owner> => {
		if (records.some((record) => record.id === value)) return value
		const start = DEFAULT_OWNERS.find((record) => record.id === value)
		const first = sortOwners(records)[0]
		if (!start && first) return first.id
		const lost: OwnerRecord = { ...(start ?? { id: DEFAULT_OWNER, name: DEFAULT_OWNER }) }
		await repo.saveOwner(lost)
		records.push(lost)
		return lost.id
	}

	for (const group of await repo.listLimitGroups()) {
		try {
			const owner = await resolve(group.owner || DEFAULT_OWNER)
			if (owner !== group.owner) await repo.saveLimitGroup({ ...group, owner })
		} catch (failure) {
			// One record that will not write must not hold back the rest, nor the page behind it.
			console.error(failure)
		}
	}

	for (const card of await repo.listCards()) {
		if (!card.supplementary || !card.owner) continue
		try {
			const owner = await resolve(card.owner)
			if (owner !== card.owner) await repo.saveCard({ ...card, owner })
		} catch (failure) {
			console.error(failure)
		}
	}
}
