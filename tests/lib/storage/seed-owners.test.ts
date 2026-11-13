import { expect, test } from "vitest"

import { memoryStorage } from "#lib/storage/contract"
import { InMemoryRepository } from "#lib/storage/repository"
import { OWNERS_SEED_KEY, seedOwners } from "#lib/storage/seed-owners"

test("seeds KC, NT and RI once", async () => {
	const repo = new InMemoryRepository()
	const storage = memoryStorage()
	await seedOwners(repo, storage)
	expect(await repo.listOwners()).toEqual([
		{ id: "KC", name: "KC" },
		{ id: "NT", name: "NT" },
		{ id: "RI", name: "RI" },
	])
	expect(storage.getItem(OWNERS_SEED_KEY)).toBe("done")
})

test("leaves stored owners alone", async () => {
	const repo = new InMemoryRepository()
	await repo.saveOwner({ id: "pim", name: "Pim" })
	await seedOwners(repo, memoryStorage())
	expect(await repo.listOwners()).toEqual([{ id: "pim", name: "Pim" }])
})

test("does not seed again once marked, even with every owner deleted", async () => {
	const repo = new InMemoryRepository()
	const storage = memoryStorage()
	await seedOwners(repo, storage)
	for (const owner of await repo.listOwners()) await repo.deleteOwner(owner.id)
	await seedOwners(repo, storage)
	expect(await repo.listOwners()).toEqual([])
})
