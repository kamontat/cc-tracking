import type { Card } from "#lib/domain/types"

import { expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { memoryStorage, sampleCard } from "#lib/storage/contract"
import { MIGRATION_KEY, migrateLocations, takeResetNotice } from "#lib/storage/migrate-locations"
import { InMemoryRepository } from "#lib/storage/repository"

/** A card as it may exist on disk from before `location` was a closed set. */
const legacyCard = (location: string, overrides: Partial<Card> = {}): Card =>
	({ ...sampleCard(overrides), location }) as unknown as Card

// A private store per test: nothing a run records can leak into another file's test.
const freshStorage = memoryStorage

test("rewrites an unrecognised location to the default and names the card", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(legacyCard("Chiang Mai", { id: "kbank", name: "KBank Visa" }))
	const storage = freshStorage()

	expect(await migrateLocations(repo, storage)).toEqual(["KBank Visa"])
	expect((await repo.getCard("kbank"))?.location).toBe("bangkok")
})

test("leaves a card that already holds a known location alone", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(sampleCard({ id: "scb", location: "phichit" }))
	const storage = freshStorage()

	expect(await migrateLocations(repo, storage)).toEqual([])
	expect((await repo.getCard("scb"))?.location).toBe("phichit")
	expect(storage.getItem(MIGRATION_KEY)).toBeNull()
})

test("is idempotent: a second run finds nothing", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(legacyCard("office", { id: "kbank", name: "KBank Visa" }))
	const storage = freshStorage()

	await migrateLocations(repo, storage)
	storage.removeItem(MIGRATION_KEY)

	expect(await migrateLocations(repo, storage)).toEqual([])
	expect(storage.getItem(MIGRATION_KEY)).toBeNull()
})

test("one unwritable card does not stop the others", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(legacyCard("office", { id: "a", name: "Card A" }))
	await repo.saveCard(legacyCard("home", { id: "b", name: "Card B" }))
	const storage = freshStorage()

	const saveCard = repo.saveCard.bind(repo)
	repo.saveCard = async (card: Card) => {
		if (card.id === "a") throw new Error("storage full")
		await saveCard(card)
	}

	expect(await migrateLocations(repo, storage)).toEqual(["Card B"])
	expect((await repo.getCard("b"))?.location).toBe("bangkok")
})

test("a card kept at a deleted default location gets that location's record back", async () => {
	const repo = new InMemoryRepository()
	await repo.saveLocation({ id: "krabi", name: "Krabi", takesPurchases: true })
	await repo.saveCard(sampleCard({ id: "scb", location: "bangkok" }))
	const storage = freshStorage()

	expect(await migrateLocations(repo, storage)).toEqual([])
	expect((await repo.getCard("scb"))?.location).toBe("bangkok")
	expect(await repo.listLocations()).toEqual([
		{ id: "bangkok", name: "Bangkok", takesPurchases: false },
		{ id: "krabi", name: "Krabi", takesPurchases: true },
	])
	expect(storage.getItem(MIGRATION_KEY)).toBeNull()
})

test("a card at a stored custom location is left alone", async () => {
	const repo = new InMemoryRepository()
	await repo.saveLocation({
		id: "chiang-mai",
		name: "Chiang Mai",
		takesPurchases: false,
	})
	await repo.saveCard(sampleCard({ id: "scb", location: "chiang-mai" }))
	const storage = freshStorage()

	expect(await migrateLocations(repo, storage)).toEqual([])
	expect((await repo.getCard("scb"))?.location).toBe("chiang-mai")
	expect((await repo.listLocations()).map((r) => r.id)).toEqual(["chiang-mai"])
})

test("any other unknown location moves the card to the default record when stored, and names it", async () => {
	const repo = new InMemoryRepository()
	await repo.saveLocation({
		id: "ayutthaya",
		name: "Ayutthaya",
		takesPurchases: false,
	})
	await repo.saveLocation({
		id: "bangkok",
		name: "Zz Bangkok",
		takesPurchases: true,
	})
	await repo.saveCard(legacyCard("Somewhere", { id: "kbank", name: "KBank Visa" }))
	const storage = freshStorage()

	expect(await migrateLocations(repo, storage)).toEqual(["KBank Visa"])
	expect((await repo.getCard("kbank"))?.location).toBe("bangkok")
	expect(JSON.parse(storage.getItem(MIGRATION_KEY) ?? "[]")).toEqual(["KBank Visa"])
})

test("without the default record, an unknown location moves to the first record by id, whatever the language", async () => {
	for (const locale of ["en", "th"] as const) {
		setLocale(locale)
		const repo = new InMemoryRepository()
		await repo.saveLocation({
			id: "b-loc",
			name: "Alpha",
			takesPurchases: false,
		})
		await repo.saveLocation({
			id: "a-loc",
			name: "Zulu",
			takesPurchases: false,
		})
		await repo.saveLocation({ id: "c-loc", name: "ก", takesPurchases: false })
		await repo.saveCard(legacyCard("Somewhere", { id: "kbank" }))

		await migrateLocations(repo, freshStorage())
		expect((await repo.getCard("kbank"))?.location).toBe("a-loc")
	}
	setLocale("en")
})

test("the notice is readable once and then gone", () => {
	const storage = freshStorage()
	storage.setItem(MIGRATION_KEY, JSON.stringify(["Card A", "Card B"]))

	expect(takeResetNotice(storage)).toEqual(["Card A", "Card B"])
	expect(takeResetNotice(storage)).toEqual([])
})

test("a corrupt notice reads as no notice", () => {
	const storage = freshStorage()
	storage.setItem(MIGRATION_KEY, "{not json")

	expect(takeResetNotice(storage)).toEqual([])
	expect(storage.getItem(MIGRATION_KEY)).toBeNull()
})
