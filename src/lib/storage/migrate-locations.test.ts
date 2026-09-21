import { expect, test } from "bun:test";
import type { Card } from "#lib/domain/types";
import { sampleCard } from "#lib/storage/contract";
import {
	MIGRATION_KEY,
	migrateLocations,
	takeResetNotice,
} from "#lib/storage/migrate-locations";
import { InMemoryRepository } from "#lib/storage/repository";

/** A card as it may exist on disk from before `location` was a closed set. */
const legacyCard = (location: string, overrides: Partial<Card> = {}): Card =>
	({ ...sampleCard(overrides), location }) as unknown as Card;

const freshStorage = (): Storage => {
	globalThis.localStorage.clear();
	return globalThis.localStorage;
};

test("rewrites an unrecognised location to the default and names the card", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(
		legacyCard("Chiang Mai", { id: "kbank", name: "KBank Visa" }),
	);
	const storage = freshStorage();

	expect(await migrateLocations(repo, storage)).toEqual(["KBank Visa"]);
	expect((await repo.getCard("kbank"))?.location).toBe("bangkok");
});

test("leaves a card that already holds a known location alone", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard({ id: "scb", location: "phichit" }));
	const storage = freshStorage();

	expect(await migrateLocations(repo, storage)).toEqual([]);
	expect((await repo.getCard("scb"))?.location).toBe("phichit");
	expect(storage.getItem(MIGRATION_KEY)).toBeNull();
});

test("is idempotent: a second run finds nothing", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(
		legacyCard("office", { id: "kbank", name: "KBank Visa" }),
	);
	const storage = freshStorage();

	await migrateLocations(repo, storage);
	storage.removeItem(MIGRATION_KEY);

	expect(await migrateLocations(repo, storage)).toEqual([]);
	expect(storage.getItem(MIGRATION_KEY)).toBeNull();
});

test("one unwritable card does not stop the others", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(legacyCard("office", { id: "a", name: "Card A" }));
	await repo.saveCard(legacyCard("home", { id: "b", name: "Card B" }));
	const storage = freshStorage();

	const saveCard = repo.saveCard.bind(repo);
	repo.saveCard = async (card: Card) => {
		if (card.id === "a") throw new Error("storage full");
		await saveCard(card);
	};

	expect(await migrateLocations(repo, storage)).toEqual(["Card B"]);
	expect((await repo.getCard("b"))?.location).toBe("bangkok");
});

test("the notice is readable once and then gone", () => {
	const storage = freshStorage();
	storage.setItem(MIGRATION_KEY, JSON.stringify(["Card A", "Card B"]));

	expect(takeResetNotice(storage)).toEqual(["Card A", "Card B"]);
	expect(takeResetNotice(storage)).toEqual([]);
});

test("a corrupt notice reads as no notice", () => {
	const storage = freshStorage();
	storage.setItem(MIGRATION_KEY, "{not json");

	expect(takeResetNotice(storage)).toEqual([]);
	expect(storage.getItem(MIGRATION_KEY)).toBeNull();
});
