import { describe, expect, test } from "bun:test";
import { sampleCard, samplePayment, samplePurchase } from "#lib/storage/contract.ts";
import { InMemoryRepository } from "#lib/storage/repository.ts";
import { exportBackup, importBackup, parseBackup } from "#lib/storage/transfer.ts";

const populated = async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard());
	await repo.saveCard(sampleCard({ id: "scb", name: "SCB Mastercard", location: "Phichit" }));
	await repo.savePurchase(samplePurchase({ id: "p1" }));
	await repo.savePurchase(samplePurchase({ id: "p2", cardId: "scb", date: "2026-09-09" }));
	await repo.savePayment(samplePayment());
	return repo;
};

describe("exportBackup", () => {
	test("captures every card, purchase, and payment", async () => {
		const backup = await exportBackup(await populated(), new Date("2026-09-21T03:00:00Z"));

		expect(backup.version).toBe(1);
		expect(backup.exportedAt).toBe("2026-09-21T03:00:00.000Z");
		expect(backup.cards.map((c) => c.id)).toEqual(["kbank", "scb"]);
		expect(backup.purchases.map((p) => p.id)).toEqual(["p1", "p2"]);
		expect(backup.payments).toHaveLength(1);
	});

	test("exports an empty store as empty lists", async () => {
		const backup = await exportBackup(new InMemoryRepository());
		expect(backup.cards).toEqual([]);
		expect(backup.purchases).toEqual([]);
		expect(backup.payments).toEqual([]);
	});

	test("does not export purchases and payments of deleted cards", async () => {
		const repo = await populated();
		// Delete the first card; its purchase and payment should not appear in the backup
		await repo.deleteCard("kbank");
		const backup = await exportBackup(repo);

		// Only the second card should be in the backup
		expect(backup.cards.map((c) => c.id)).toEqual(["scb"]);
		// Only the second card's purchase should be exported
		expect(backup.purchases.map((p) => p.id)).toEqual(["p2"]);
		// No payments should remain (the only payment was for kbank which was deleted)
		expect(backup.payments).toEqual([]);
	});
});

describe("parseBackup", () => {
	test("accepts a backup this app wrote", async () => {
		const text = JSON.stringify(await exportBackup(await populated()));
		expect(parseBackup(text).cards).toHaveLength(2);
	});

	test("rejects malformed JSON", () => {
		expect(() => parseBackup("{nope")).toThrow(/not a readable backup/i);
	});

	test("rejects a future backup version", () => {
		expect(() => parseBackup(JSON.stringify({ version: 2, cards: [], purchases: [], payments: [] })))
			.toThrow(/version 2/i);
	});

	test("rejects JSON missing the expected lists", () => {
		expect(() => parseBackup(JSON.stringify({ version: 1 }))).toThrow(/not a readable backup/i);
	});
});

describe("importBackup", () => {
	test("restores everything into an empty repository", async () => {
		const backup = await exportBackup(await populated());
		const restored = new InMemoryRepository();
		await importBackup(restored, backup);

		expect((await restored.listCards()).map((c) => c.id)).toEqual(["kbank", "scb"]);
		expect((await restored.listPurchases("kbank")).map((p) => p.id)).toEqual(["p1"]);
		expect(await restored.listPayments("kbank")).toHaveLength(1);
	});

	test("merges over existing records rather than wiping them", async () => {
		const target = new InMemoryRepository();
		await target.saveCard(sampleCard({ id: "ktc", name: "KTC Card", location: "Bangkok" }));
		await target.saveCard(sampleCard({ name: "stale name" }));

		await importBackup(target, await exportBackup(await populated()));

		const cards = await target.listCards();
		expect(cards.map((c) => c.id)).toEqual(["kbank", "ktc", "scb"]);
		expect(cards.find((c) => c.id === "kbank")?.name).toBe("KBank Visa");
	});
});
