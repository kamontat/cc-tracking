import { expect, test } from "vitest"

import { InMemoryRepository } from "#lib/storage/repository"
import { SEED_KEY, seedLocations } from "#lib/storage/seed-locations"

const fakeStorage = () => {
	const map = new Map<string, string>()
	return {
		map,
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
	}
}

const ticks = async (repo: InMemoryRepository) =>
	Object.fromEntries((await repo.listLocations()).map((r) => [r.id, r.takesPurchases]))

test("seeds the three defaults with today's ticks", async () => {
	const repo = new InMemoryRepository()
	await repo.saveSettings({
		...(await repo.getSettings()),
		purchaseLocations: ["bangkok"],
	})
	await seedLocations(repo, fakeStorage())
	expect(await ticks(repo)).toEqual({
		bangkok: true,
		phichit: false,
		krabi: false,
	})
})

test("seeds Krabi only on fresh storage", async () => {
	const repo = new InMemoryRepository()
	await seedLocations(repo, fakeStorage())
	expect(await ticks(repo)).toEqual({
		bangkok: false,
		phichit: false,
		krabi: true,
	})
})

test("does not seed twice", async () => {
	const repo = new InMemoryRepository()
	const storage = fakeStorage()
	await seedLocations(repo, storage)
	for (const record of await repo.listLocations()) await repo.deleteLocation(record.id)
	await seedLocations(repo, storage)
	expect(await repo.listLocations()).toEqual([])
})

test("leaves stored records alone", async () => {
	const repo = new InMemoryRepository()
	const storage = fakeStorage()
	await repo.saveLocation({ id: "home", name: "Home", takesPurchases: true })
	await seedLocations(repo, storage)
	expect(await repo.listLocations()).toEqual([{ id: "home", name: "Home", takesPurchases: true }])
	expect(storage.getItem(SEED_KEY)).not.toBeNull()
})

test("seeds again after clearAll", async () => {
	const repo = new InMemoryRepository()
	const storage = fakeStorage()
	await seedLocations(repo, storage)
	await repo.clearAll()
	storage.map.delete(SEED_KEY)
	await seedLocations(repo, storage)
	expect((await repo.listLocations()).length).toBe(3)
})
