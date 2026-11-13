import { describe, expect, test } from "vitest"

import { assignGroupColors, GROUP_COLORS_MIGRATION_KEY, migrateGroupColors } from "#lib/storage/assign-group-colors"
import { memoryStorage, sampleLimitGroup } from "#lib/storage/contract"
import { InMemoryRepository } from "#lib/storage/repository"
import {
	type BackupV4,
	exportBackupV4,
	importBackupV4,
	parseAnyBackup,
	replaceWithBackupV4,
} from "#lib/storage/transfer-v4"

const NOW = new Date("2026-11-03T00:00:00.000Z")

const backupOf = (limitGroups: unknown[]): BackupV4 =>
	parseAnyBackup(
		JSON.stringify({
			version: 3,
			exportedAt: NOW.toISOString(),
			limitGroups,
			cards: [],
			purchases: [],
			payments: [],
			statementDates: [],
			lists: [],
			locations: [],
		}),
	)

const group = (id: string, color?: unknown) => ({
	...sampleLimitGroup({ id, name: id }),
	...(color === undefined ? {} : { color }),
})

const colours = async (repo: InMemoryRepository) =>
	Object.fromEntries((await repo.listLimitGroups()).map((g) => [g.id, g.color]))

describe("migrateGroupColors", () => {
	test("colours the first four in order, sets the marker, then does nothing", async () => {
		const repo = new InMemoryRepository()
		const storage = memoryStorage()
		for (const id of ["g1", "g2", "g3", "g4", "g5"]) await repo.saveLimitGroup(sampleLimitGroup({ id, name: id }))
		expect(await migrateGroupColors(repo, storage)).toBe(5)
		const after = await colours(repo)
		expect(["g1", "g2", "g3", "g4"].map((id) => after[id])).toEqual(["blue", "green", "purple", "orange"])
		expect(after["g5"]).toBeDefined()
		expect(storage.getItem(GROUP_COLORS_MIGRATION_KEY)).not.toBeNull()
		await repo.saveLimitGroup(sampleLimitGroup({ id: "g6", name: "g6" }))
		expect(await migrateGroupColors(repo, storage)).toBe(0)
		expect((await colours(repo))["g6"]).toBeUndefined()
	})

	test("assignGroupColors passes the draw through and returns the count", async () => {
		const repo = new InMemoryRepository()
		for (const id of ["g1", "g2", "g3", "g4", "g5"]) await repo.saveLimitGroup(sampleLimitGroup({ id, name: id }))
		expect(await assignGroupColors(repo, () => 0)).toBe(5)
		expect((await colours(repo))["g5"]).toBe("teal")
		expect(await assignGroupColors(repo)).toBe(0)
	})
})

describe("restoring colours", () => {
	test("Merge keeps the stored colour when the file has none or an invalid one", async () => {
		const repo = new InMemoryRepository()
		await repo.saveLimitGroup(sampleLimitGroup({ id: "g1", color: "teal" }))
		await repo.saveLimitGroup(sampleLimitGroup({ id: "g2", color: "plum" }))
		await importBackupV4(repo, backupOf([group("g1"), group("g2", "nope"), group("g3")]))
		const after = await colours(repo)
		expect(after["g1"]).toBe("teal")
		expect(after["g2"]).toBe("plum")
		expect(after["g3"]).toBeDefined()
	})

	test("a failure while colouring is logged and does not fail the restore", async () => {
		let calls = 0
		class Flaky extends InMemoryRepository {
			override async saveLimitGroup(g: Parameters<InMemoryRepository["saveLimitGroup"]>[0]) {
				calls += 1
				if (calls > 1) throw new Error("colour pass failed")
				return super.saveLimitGroup(g)
			}
		}
		const original = console.error
		const logged: unknown[][] = []
		console.error = (...args: unknown[]) => {
			logged.push(args)
		}
		try {
			await importBackupV4(new Flaky(), backupOf([group("g1")]))
		} finally {
			console.error = original
		}
		expect(logged.length).toBe(1)
	})

	test("a colour in the file wins on Merge and on Replace", async () => {
		const merged = new InMemoryRepository()
		await merged.saveLimitGroup(sampleLimitGroup({ id: "g1", color: "teal" }))
		await importBackupV4(merged, backupOf([group("g1", "rose")]))
		expect((await colours(merged))["g1"]).toBe("rose")

		const replaced = new InMemoryRepository()
		await replaceWithBackupV4(replaced, backupOf([group("g1", "rose")]), memoryStorage())
		expect((await colours(replaced))["g1"]).toBe("rose")
	})

	test("Replace colours a colourless file in order and leaves nothing for the marker", async () => {
		const repo = new InMemoryRepository()
		const storage = memoryStorage()
		await replaceWithBackupV4(repo, backupOf([group("g1"), group("g2"), group("g3"), group("g4")]), storage)
		const after = await colours(repo)
		expect(["g1", "g2", "g3", "g4"].map((id) => after[id])).toEqual(["blue", "green", "purple", "orange"])
		expect(await migrateGroupColors(repo, storage)).toBe(0)
	})

	test("the export writes the stored colour", async () => {
		const repo = new InMemoryRepository()
		await repo.saveLimitGroup(sampleLimitGroup({ id: "g1", color: "plum" }))
		const exported = await exportBackupV4(repo, NOW)
		expect(exported.limitGroups[0]?.color).toBe("plum")
	})
})
