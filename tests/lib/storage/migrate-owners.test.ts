import type { LimitGroup } from "#lib/domain/types"

import { expect, test } from "vitest"

import { sampleCard, sampleLimitGroup } from "#lib/storage/contract"
import { migrateOwners } from "#lib/storage/migrate-owners"
import { InMemoryRepository } from "#lib/storage/repository"

/** A limit group saved before the owner field existed. */
const ownerless = (): LimitGroup => {
	const { owner: _, ...group } = sampleLimitGroup()
	return group
}

const ownerIds = async (repo: InMemoryRepository) => (await repo.listOwners()).map((o) => o.id)

test("leaves groups and cards that name a stored owner alone", async () => {
	const repo = new InMemoryRepository()
	await repo.saveOwner({ id: "pim", name: "Pim" })
	await repo.saveOwner({ id: "NT", name: "NT" })
	await repo.saveLimitGroup(sampleLimitGroup({ owner: "pim" }))
	await repo.saveCard(sampleCard({ supplementary: true, owner: "NT" }))
	await migrateOwners(repo)
	expect((await repo.listLimitGroups())[0]?.owner).toBe("pim")
	expect((await repo.listCards())[0]?.owner).toBe("NT")
	expect(await ownerIds(repo)).toEqual(["NT", "pim"])
})

test("a group with no owner is KC's, and KC's record comes back when it is gone", async () => {
	const repo = new InMemoryRepository()
	await repo.saveOwner({ id: "pim", name: "Pim" })
	await repo.saveLimitGroup(ownerless())
	await migrateOwners(repo)
	expect((await repo.listLimitGroups())[0]?.owner).toBe("KC")
	expect(await repo.listOwners()).toEqual([
		{ id: "KC", name: "KC" },
		{ id: "pim", name: "Pim" },
	])
})

test("a starting owner whose record is gone comes back", async () => {
	const repo = new InMemoryRepository()
	await repo.saveOwner({ id: "KC", name: "Kamontat" })
	await repo.saveLimitGroup(sampleLimitGroup({ owner: "RI" }))
	await repo.saveCard(sampleCard({ supplementary: true, owner: "NT" }))
	await migrateOwners(repo)
	expect((await repo.listLimitGroups())[0]?.owner).toBe("RI")
	expect((await repo.listCards())[0]?.owner).toBe("NT")
	expect(await repo.listOwners()).toEqual([
		{ id: "KC", name: "Kamontat" },
		{ id: "NT", name: "NT" },
		{ id: "RI", name: "RI" },
	])
})

test("any other unknown owner moves to the first owner A to Z by name", async () => {
	const repo = new InMemoryRepository()
	await repo.saveOwner({ id: "zz", name: "Zed" })
	await repo.saveOwner({ id: "pim", name: "Pim" })
	await repo.saveLimitGroup(sampleLimitGroup({ owner: "gone" }))
	await repo.saveCard(sampleCard({ supplementary: true, owner: "gone" }))
	await migrateOwners(repo)
	expect((await repo.listLimitGroups())[0]?.owner).toBe("pim")
	expect((await repo.listCards())[0]?.owner).toBe("pim")
	expect(await ownerIds(repo)).toEqual(["pim", "zz"])
})

test("with no owner stored at all, KC comes back to hold the unknown", async () => {
	const repo = new InMemoryRepository()
	await repo.saveLimitGroup(sampleLimitGroup({ owner: "gone" }))
	await migrateOwners(repo)
	expect((await repo.listLimitGroups())[0]?.owner).toBe("KC")
	expect(await ownerIds(repo)).toEqual(["KC"])
})

test("an owner on a card that is not supplementary, or none on one that is, is not touched", async () => {
	const repo = new InMemoryRepository()
	await repo.saveOwner({ id: "KC", name: "KC" })
	await repo.saveCard(sampleCard({ id: "a", owner: "gone" }))
	await repo.saveCard(sampleCard({ id: "b", supplementary: true }))
	await migrateOwners(repo)
	expect(await repo.listCards()).toEqual([
		sampleCard({ id: "a", owner: "gone" }),
		sampleCard({ id: "b", supplementary: true }),
	])
	expect(await ownerIds(repo)).toEqual(["KC"])
})

test("one record that will not write does not stop the rest", async () => {
	class Flaky extends InMemoryRepository {
		override async saveLimitGroup(group: Parameters<InMemoryRepository["saveLimitGroup"]>[0]) {
			if (group.id === "bad") throw new Error("full")
			return super.saveLimitGroup(group)
		}
	}
	const repo = new Flaky()
	await repo.saveOwner({ id: "KC", name: "KC" })
	await InMemoryRepository.prototype.saveLimitGroup.call(repo, sampleLimitGroup({ id: "bad", owner: "gone" }))
	await repo.saveLimitGroup(sampleLimitGroup({ id: "good", owner: "gone" }))
	const quiet = console.error
	console.error = () => {}
	try {
		await migrateOwners(repo)
	} finally {
		console.error = quiet
	}
	expect((await repo.listLimitGroups()).map((g) => [g.id, g.owner])).toEqual([
		["bad", "gone"],
		["good", "KC"],
	])
})
