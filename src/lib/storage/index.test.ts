import { expect, test } from "bun:test";
import { createRepository, StorageUnavailableError } from "#lib/storage/index.ts";
import { sampleCard } from "#lib/storage/contract.ts";

test("createRepository throws StorageUnavailableError if storage probe fails", () => {
	const failing = {
		length: 0,
		key: () => null,
		getItem: () => null,
		removeItem: () => {},
		clear: () => {},
		setItem: () => {
			throw new DOMException("quota", "QuotaExceededError");
		},
	} as unknown as Storage;

	expect(() => createRepository(failing)).toThrow(StorageUnavailableError);
});

test("createRepository returns a working repository", async () => {
	localStorage.clear();
	const repo = createRepository(localStorage);
	const card = sampleCard();

	await repo.saveCard(card);
	const retrieved = await repo.getCard(card.id);

	expect(retrieved).toEqual(card);
});

test("createRepository uses globalThis.localStorage by default", async () => {
	localStorage.clear();
	const repo = createRepository();
	const card = sampleCard({ id: "test-card" });

	await repo.saveCard(card);
	const retrieved = await repo.getCard("test-card");

	expect(retrieved).toEqual(card);
});

test("createRepository throws StorageUnavailableError when localStorage is unavailable", () => {
	const original = globalThis.localStorage;
	try {
		// @ts-expect-error Intentionally breaking the global for this test
		delete globalThis.localStorage;
		expect(() => createRepository()).toThrow(StorageUnavailableError);
	} finally {
		globalThis.localStorage = original;
	}
});
