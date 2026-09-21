import { describe, expect, test } from "bun:test";
import {
	sampleCard,
	samplePayment,
	samplePurchase,
} from "#lib/storage/contract";
import { InMemoryRepository } from "#lib/storage/repository";
import { exportBackup, importBackup, parseBackup } from "#lib/storage/transfer";

const populated = async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard());
	await repo.saveCard(
		sampleCard({ id: "scb", name: "SCB Mastercard", location: "phichit" }),
	);
	await repo.savePurchase(samplePurchase({ id: "p1" }));
	await repo.savePurchase(
		samplePurchase({ id: "p2", cardId: "scb", date: "2026-09-09" }),
	);
	await repo.savePayment(samplePayment());
	return repo;
};

describe("exportBackup", () => {
	test("captures every card, purchase, and payment", async () => {
		const backup = await exportBackup(
			await populated(),
			new Date("2026-09-21T03:00:00Z"),
		);

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

	test("does not resurrect deleted card records on card re-creation", async () => {
		const repo = new InMemoryRepository();
		// Save a card with a purchase and a payment
		await repo.saveCard(sampleCard({ id: "kbank" }));
		await repo.savePurchase(
			samplePurchase({ id: "p1", cardId: "kbank", amount: 10_000 }),
		);
		await repo.savePayment(
			samplePayment({ cardId: "kbank", period: "2026-09" }),
		);

		// Delete the card
		await repo.deleteCard("kbank");

		// Create a new card with the same id (mimics user deleting and re-adding a card)
		await repo.saveCard(sampleCard({ id: "kbank", location: "bangkok" }));

		// Export and verify no orphaned records reappear
		const backup = await exportBackup(repo);
		expect(backup.cards.map((c) => c.id)).toEqual(["kbank"]);
		expect(backup.cards[0]?.location).toBe("bangkok");
		expect(backup.purchases).toEqual([]); // Old purchase must not resurface
		expect(backup.payments).toEqual([]); // Old payment must not resurface
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
		expect(() =>
			parseBackup(
				JSON.stringify({ version: 2, cards: [], purchases: [], payments: [] }),
			),
		).toThrow(/version 2/i);
	});

	test("rejects JSON missing the expected lists", () => {
		expect(() => parseBackup(JSON.stringify({ version: 1 }))).toThrow(
			/not a readable backup/i,
		);
	});

	test("rejects a card that is missing its required fields", () => {
		expect(() =>
			parseBackup(
				JSON.stringify({
					version: 1,
					cards: [{}],
					purchases: [],
					payments: [],
				}),
			),
		).toThrow(/card #1/i);
	});

	test("rejects a purchase with a non-integer amount", () => {
		expect(() =>
			parseBackup(
				JSON.stringify({
					version: 1,
					cards: [],
					purchases: [
						{
							id: "p1",
							cardId: "kbank",
							date: "2026-09-05",
							amount: 100.5,
							note: "",
						},
					],
					payments: [],
				}),
			),
		).toThrow(/non-integer amount/i);
	});

	test("rejects a string version, even one that looks like the right number", () => {
		expect(() =>
			parseBackup(
				JSON.stringify({
					version: "1",
					cards: [],
					purchases: [],
					payments: [],
				}),
			),
		).toThrow(/version/i);
	});

	test("a valid backup still round-trips", async () => {
		const backup = await exportBackup(await populated());
		const parsed = parseBackup(JSON.stringify(backup));

		expect(parsed.cards.map((c) => c.id)).toEqual(["kbank", "scb"]);
		expect(parsed.purchases.map((p) => p.id)).toEqual(["p1", "p2"]);
		expect(parsed.payments).toHaveLength(1);
	});

	test("rejects a backup whose card has an unknown location", () => {
		const backup = {
			version: 1,
			exportedAt: "2026-09-21T00:00:00.000Z",
			cards: [
				{
					id: "kbank",
					name: "KBank Visa",
					last4: "4821",
					location: "Chiang Mai",
					cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
					archived: false,
				},
			],
			purchases: [],
			payments: [],
		};

		expect(() => parseBackup(JSON.stringify(backup))).toThrow(
			"That backup's card #1 has a location that is not bangkok, phichit, or krabi.",
		);
	});

	test("accepts a backup whose card location is a known key", () => {
		const backup = {
			version: 1,
			exportedAt: "2026-09-21T00:00:00.000Z",
			cards: [
				{
					id: "kbank",
					name: "KBank Visa",
					last4: "4821",
					location: "phichit",
					cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
					archived: false,
				},
			],
			purchases: [],
			payments: [],
		};

		expect(parseBackup(JSON.stringify(backup)).cards[0]?.location).toBe(
			"phichit",
		);
	});
});

describe("importBackup", () => {
	test("restores everything into an empty repository", async () => {
		const backup = await exportBackup(await populated());
		const restored = new InMemoryRepository();
		await importBackup(restored, backup);

		expect((await restored.listCards()).map((c) => c.id)).toEqual([
			"kbank",
			"scb",
		]);
		expect((await restored.listPurchases("kbank")).map((p) => p.id)).toEqual([
			"p1",
		]);
		expect(await restored.listPayments("kbank")).toHaveLength(1);
	});

	test("merges over existing records rather than wiping them", async () => {
		const target = new InMemoryRepository();
		await target.saveCard(
			sampleCard({ id: "ktc", name: "KTC Card", location: "bangkok" }),
		);
		await target.saveCard(sampleCard({ name: "stale name" }));

		await importBackup(target, await exportBackup(await populated()));

		const cards = await target.listCards();
		expect(cards.map((c) => c.id)).toEqual(["kbank", "ktc", "scb"]);
		expect(cards.find((c) => c.id === "kbank")?.name).toBe("KBank Visa");
	});
});
