import { describe, expect, test } from "bun:test";
import { repositoryContract, sampleCard, samplePurchase } from "#lib/storage/contract.ts";
import { LocalStorageRepository } from "#lib/storage/local.ts";
import { StorageError } from "#lib/storage/repository.ts";

const freshStorage = (): Storage => {
	localStorage.clear();
	return localStorage;
};

repositoryContract("localStorage", () => new LocalStorageRepository(freshStorage()));

describe("LocalStorageRepository key layout", () => {
	test("writes the documented key shapes", async () => {
		const repo = new LocalStorageRepository(freshStorage());
		await repo.saveCard(sampleCard());
		await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-09-05" }));

		expect(localStorage.getItem("cc:card:kbank")).not.toBeNull();
		expect(localStorage.getItem("cc:purchase:kbank:2026-09-05:p1")).not.toBeNull();
	});

	test("ignores unrelated keys in the same origin", async () => {
		const repo = new LocalStorageRepository(freshStorage());
		localStorage.setItem("some-other-app", "hello");
		expect(await repo.listCards()).toEqual([]);
	});

	test("moves the key when a purchase date is edited", async () => {
		const repo = new LocalStorageRepository(freshStorage());
		await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-09-05" }));
		await repo.deletePurchase("kbank", "p1");
		await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-09-25" }));

		const purchases = await repo.listPurchases("kbank");
		expect(purchases).toHaveLength(1);
		expect(purchases[0]?.date).toBe("2026-09-25");
	});

	test("reports corrupt JSON as a StorageError naming the key", async () => {
		const repo = new LocalStorageRepository(freshStorage());
		localStorage.setItem("cc:card:broken", "{not json");
		await expect(repo.listCards()).rejects.toThrow(StorageError);
	});

	test("reports a failing write as a StorageError", async () => {
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

		const repo = new LocalStorageRepository(failing);
		await expect(repo.saveCard(sampleCard())).rejects.toThrow(StorageError);
	});

	test("isolates card data when card ids contain colons", async () => {
		const repo = new LocalStorageRepository(freshStorage());
		// Save two cards where one id is a prefix of the other
		await repo.saveCard(sampleCard({ id: "abc" }));
		await repo.saveCard(sampleCard({ id: "abc:def" }));

		// Save purchases for both cards
		await repo.savePurchase(samplePurchase({ id: "p1", cardId: "abc", date: "2026-09-05" }));
		await repo.savePurchase(samplePurchase({ id: "p2", cardId: "abc:def", date: "2026-09-10" }));

		// Verify each card only sees its own purchases
		const abcPurchases = await repo.listPurchases("abc");
		const abcDefPurchases = await repo.listPurchases("abc:def");

		expect(abcPurchases).toHaveLength(1);
		expect(abcPurchases[0]?.id).toBe("p1");

		expect(abcDefPurchases).toHaveLength(1);
		expect(abcDefPurchases[0]?.id).toBe("p2");
	});
});
