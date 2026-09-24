import { describe, expect, test } from "bun:test";
import type { Card, LimitGroup } from "#lib/domain/types";
import { MessageError } from "#lib/i18n/error";
import {
	sampleCard,
	samplePayment,
	samplePurchase,
} from "#lib/storage/contract";
import type { Repository } from "#lib/storage/repository";
import { InMemoryRepository } from "#lib/storage/repository";
import { exportBackup, importBackup, parseBackup } from "#lib/storage/transfer";

/** Runs `fn`, expecting it to throw, and returns what it threw. */
function captureThrow(fn: () => unknown): unknown {
	try {
		fn();
	} catch (failure) {
		return failure;
	}
	throw new Error("expected function to throw");
}

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

		expect(backup.version).toBe(2);
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
		const failure = captureThrow(() => parseBackup("{nope"));
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).key).toBe("backup.unreadable");
	});

	test("rejects a future backup version", () => {
		const failure = captureThrow(() =>
			parseBackup(
				JSON.stringify({
					version: 3,
					cards: [],
					purchases: [],
					payments: [],
					limitGroups: [],
				}),
			),
		);
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).key).toBe("backup.version");
		expect((failure as MessageError).params).toEqual({
			found: "3",
			expected: 2,
		});
	});

	test("rejects JSON missing the expected lists", () => {
		const failure = captureThrow(() =>
			parseBackup(JSON.stringify({ version: 2 })),
		);
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).key).toBe("backup.unreadable");
	});

	test("rejects a card that is missing its required fields", () => {
		const failure = captureThrow(() =>
			parseBackup(
				JSON.stringify({
					version: 2,
					limitGroups: [],
					cards: [{}],
					purchases: [],
					payments: [],
				}),
			),
		);
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).key).toBe("backup.card");
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.missingId",
		});
	});

	test("names which card is wrong, by key", () => {
		const backup = {
			version: 2,
			exportedAt: "2026-09-21T00:00:00.000Z",
			limitGroups: [],
			cards: [{ id: "kbank", name: "KBank Visa", last4: "4821" }],
			purchases: [],
			payments: [],
		};

		try {
			parseBackup(JSON.stringify(backup));
			throw new Error("expected parseBackup to throw");
		} catch (failure) {
			expect(failure).toBeInstanceOf(MessageError);
			expect((failure as MessageError).key).toBe("backup.card");
			expect((failure as MessageError).params).toEqual({
				index: 1,
				problem: "backup.problem.badLocation",
			});
		}
	});

	test("rejects a purchase with a non-integer amount", () => {
		const failure = captureThrow(() =>
			parseBackup(
				JSON.stringify({
					version: 2,
					limitGroups: [],
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
		);
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).key).toBe("backup.purchase");
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.badAmount",
		});
	});

	test("rejects a string version, even one that looks like the right number", () => {
		const failure = captureThrow(() =>
			parseBackup(
				JSON.stringify({
					version: "2",
					limitGroups: [],
					cards: [],
					purchases: [],
					payments: [],
				}),
			),
		);
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).key).toBe("backup.version");
		expect((failure as MessageError).params).toEqual({
			found: '"2"',
			expected: 2,
		});
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
			version: 2,
			exportedAt: "2026-09-21T00:00:00.000Z",
			limitGroups: [],
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

		const failure = captureThrow(() => parseBackup(JSON.stringify(backup)));
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).key).toBe("backup.card");
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.badLocation",
		});
	});

	test("accepts a backup whose card location is a known key", () => {
		const backup = {
			version: 2,
			exportedAt: "2026-09-21T00:00:00.000Z",
			limitGroups: [],
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

describe("settings in a backup", () => {
	test("exports the stored settings alongside everything else", async () => {
		const repo = await populated();
		await repo.saveSettings({ purchaseLocations: ["bangkok", "krabi"] });
		const backup = await exportBackup(repo);

		expect(backup.version).toBe(2);
		expect(backup.settings).toEqual({
			purchaseLocations: ["bangkok", "krabi"],
		});
	});

	test("restores them on import", async () => {
		const repo = await populated();
		await repo.saveSettings({ purchaseLocations: ["phichit"] });
		const restored = new InMemoryRepository();
		await importBackup(restored, await exportBackup(repo));

		expect(await restored.getSettings()).toEqual({
			purchaseLocations: ["phichit"],
		});
	});

	test("an older file carrying no settings still imports, leaving them untouched", async () => {
		const restored = new InMemoryRepository();
		await restored.saveSettings({ purchaseLocations: ["bangkok"] });
		const parsed = parseBackup(
			JSON.stringify({
				version: 2,
				exportedAt: "2026-09-23T00:00:00.000Z",
				limitGroups: [],
				cards: [],
				purchases: [],
				payments: [],
			}),
		);
		await importBackup(restored, parsed);

		expect(parsed.settings).toBeUndefined();
		expect(await restored.getSettings()).toEqual({
			purchaseLocations: ["bangkok"],
		});
	});

	test("drops a stored location the closed set does not recognise", () => {
		const parsed = parseBackup(
			JSON.stringify({
				version: 2,
				exportedAt: "2026-09-23T00:00:00.000Z",
				limitGroups: [],
				cards: [],
				purchases: [],
				payments: [],
				settings: { purchaseLocations: ["krabi", "chiang-mai"] },
			}),
		);
		expect(parsed.settings).toEqual({ purchaseLocations: ["krabi"] });
	});

	test("reads settings that are not an object as none at all", () => {
		const parsed = parseBackup(
			JSON.stringify({
				version: 2,
				exportedAt: "2026-09-23T00:00:00.000Z",
				limitGroups: [],
				cards: [],
				purchases: [],
				payments: [],
				settings: "krabi",
			}),
		);
		expect(parsed.settings).toBeUndefined();
	});
});

describe("owner in a backup", () => {
	test("keeps a known owner", () => {
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [],
			cards: [sampleCard({ owner: "RI" })],
			purchases: [],
			payments: [],
		});
		expect(parseBackup(text).cards[0]?.owner).toBe("RI");
	});

	test("rejects an owner outside the closed set", () => {
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [],
			cards: [{ ...sampleCard(), owner: "ZZ" }],
			purchases: [],
			payments: [],
		});
		const failure = captureThrow(() => parseBackup(text));
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.badOwner",
		});
	});

	test("accepts a card written before the owner field existed", () => {
		const { owner: _owner, ...legacy } = sampleCard();
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [],
			cards: [legacy],
			purchases: [],
			payments: [],
		});
		expect(parseBackup(text).cards).toHaveLength(1);
	});

	test("keeps a known owner on a limit group", () => {
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [{ id: "pool", name: "KBank", limit: 500_000, owner: "NT" }],
			cards: [],
			purchases: [],
			payments: [],
		});
		expect(parseBackup(text).limitGroups[0]?.owner).toBe("NT");
	});

	test("accepts a limit group saved before the owner field existed", () => {
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [{ id: "pool", name: "KBank", limit: 500_000 }],
			cards: [],
			purchases: [],
			payments: [],
		});
		expect(parseBackup(text).limitGroups[0]?.owner).toBeUndefined();
	});

	test("rejects a limit group whose owner is outside the closed set", () => {
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [{ id: "pool", name: "KBank", limit: 500_000, owner: "ZZ" }],
			cards: [],
			purchases: [],
			payments: [],
		});
		const failure = captureThrow(() => parseBackup(text));
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.badOwner",
		});
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

	test("exports limit groups alongside the cards", async () => {
		const repo = new InMemoryRepository();
		await repo.saveLimitGroup({ id: "pool", name: "KBank", limit: 500_000 });
		const backup = await exportBackup(repo);
		expect(backup.version).toBe(2);
		expect(backup.limitGroups).toEqual([
			{ id: "pool", name: "KBank", limit: 500_000 },
		]);
	});

	test("rejects a version 1 file", () => {
		const text = JSON.stringify({
			version: 1,
			exportedAt: "2026-09-23T00:00:00.000Z",
			cards: [],
			purchases: [],
			payments: [],
		});
		expect(() => parseBackup(text)).toThrow(MessageError);
	});

	test("rejects a file with no limitGroups list", () => {
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			cards: [],
			purchases: [],
			payments: [],
		});
		expect(() => parseBackup(text)).toThrow(MessageError);
	});

	test("names the limit group that is wrong, by position", () => {
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [{ id: "pool", name: "KBank", limit: "lots" }],
			cards: [],
			purchases: [],
			payments: [],
		});
		try {
			parseBackup(text);
			throw new Error("expected parseBackup to throw");
		} catch (failure) {
			expect(failure).toBeInstanceOf(MessageError);
			expect((failure as MessageError).key).toBe("backup.limitGroup");
			expect((failure as MessageError).params).toEqual({
				index: 1,
				problem: "backup.problem.badLimit",
			});
		}
	});

	test("imports limit groups before the cards that point at them", async () => {
		const repo = new InMemoryRepository();
		const written: string[] = [];
		const spy = {
			...repo,
			saveLimitGroup: async (group: LimitGroup) => {
				written.push("group");
				return repo.saveLimitGroup(group);
			},
			saveCard: async (card: Card) => {
				written.push("card");
				return repo.saveCard(card);
			},
		} as unknown as Repository;

		await importBackup(spy, {
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [{ id: "pool", name: "KBank", limit: 500_000 }],
			cards: [sampleCard({ limitGroupId: "pool" })],
			purchases: [],
			payments: [],
		});

		expect(written).toEqual(["group", "card"]);
	});

	test("accepts a card pointing at a group the file does not define", () => {
		const text = JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [],
			cards: [sampleCard({ limitGroupId: "elsewhere" })],
			purchases: [],
			payments: [],
		});
		expect(parseBackup(text).cards).toHaveLength(1);
	});
});
