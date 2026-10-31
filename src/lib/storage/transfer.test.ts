import { describe, expect, test } from "bun:test";
import { MessageError } from "#lib/i18n/error";
import {
	sampleCard,
	samplePayment,
	samplePurchase,
} from "#lib/storage/contract";
import type { Repository } from "#lib/storage/repository";
import { InMemoryRepository } from "#lib/storage/repository";
import {
	importBackupV3 as importBackup,
	parseAnyBackup as parseBackup,
} from "#lib/storage/transfer-v3";

/** A version 2 file's contents, the shape the validators here are shared with. */
const exportBackup = async (repo: Repository) => {
	const cards = await repo.listCards();
	const purchases = [];
	const payments = [];
	for (const card of cards) {
		purchases.push(...(await repo.listPurchases(card.id)));
		payments.push(...(await repo.listPayments(card.id)));
	}
	return {
		version: 2,
		exportedAt: "2026-09-21T03:00:00.000Z",
		limitGroups: await repo.listLimitGroups(),
		cards,
		purchases,
		payments,
		settings: await repo.getSettings(),
	};
};

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
					version: 4,
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
			found: "4",
			expected: 3,
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
			expected: 3,
		});
	});

	test("a valid backup still round-trips", async () => {
		const backup = await exportBackup(await populated());
		const parsed = parseBackup(JSON.stringify(backup));

		expect(parsed.cards.map((c) => c.id)).toEqual(["kbank", "scb"]);
		expect(parsed.purchases.map((p) => p.id)).toEqual(["p1", "p2"]);
		expect(parsed.payments).toHaveLength(1);
	});

	const withPayment = (payment: Record<string, unknown>) =>
		JSON.stringify({
			version: 2,
			exportedAt: "2026-09-21T00:00:00.000Z",
			limitGroups: [],
			cards: [],
			purchases: [],
			payments: [
				{
					cardId: "kbank",
					period: "2026-09",
					paidAt: "2026-10-01",
					closeDate: "2026-09-18",
					dueDate: "2026-10-03",
					...payment,
				},
			],
		});

	test("rejects a payment whose partial payments are malformed", () => {
		for (const parts of [
			"all",
			[],
			[{ paidAt: "soon", amount: 100 }],
			[{ paidAt: "2026-10-01", amount: 0 }],
			[{ paidAt: "2026-10-01", amount: 1.5 }],
		]) {
			const failure = captureThrow(() => parseBackup(withPayment({ parts })));
			expect((failure as MessageError).key).toBe("backup.payment");
			expect((failure as MessageError).params).toEqual({
				index: 1,
				problem: "backup.problem.badParts",
			});
		}
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

describe("owner in a backup", () => {
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

	const withCard = (card: Record<string, unknown>) =>
		JSON.stringify({
			version: 2,
			exportedAt: "2026-09-23T00:00:00.000Z",
			limitGroups: [],
			cards: [
				{
					id: "a2",
					name: "Card A",
					last4: "2222",
					location: "krabi",
					cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
					archived: false,
					...card,
				},
			],
			purchases: [],
			payments: [],
		});

	test("keeps the holder of a supplementary card", () => {
		const text = withCard({ supplementary: true, owner: "NT" });
		expect(parseBackup(text).cards[0]?.owner).toBe("NT");
	});

	test("accepts a card saved before cards had an owner", () => {
		expect(parseBackup(withCard({})).cards[0]?.owner).toBeUndefined();
	});

	test("rejects a card whose owner is outside the closed set", () => {
		const failure = captureThrow(() =>
			parseBackup(withCard({ supplementary: true, owner: "ZZ" })),
		);
		expect(failure).toBeInstanceOf(MessageError);
		expect((failure as MessageError).params).toEqual({
			index: 1,
			problem: "backup.problem.badOwner",
		});
	});
});

describe("entry time in a backup", () => {
	const withPurchase = (purchase: Record<string, unknown>) =>
		JSON.stringify({
			version: 2,
			exportedAt: "2026-10-27T00:00:00.000Z",
			limitGroups: [],
			cards: [],
			purchases: [
				{
					id: "p1",
					cardId: "kbank",
					date: "2026-10-20",
					amount: 100,
					note: "",
					...purchase,
				},
			],
			payments: [],
		});

	test("imports a purchase with addedAt and keeps it", async () => {
		const repo = new InMemoryRepository();
		await importBackup(
			repo,
			parseBackup(withPurchase({ addedAt: "2026-10-27T03:15:00.000Z" })),
		);
		const [stored] = await repo.listPurchases("kbank");
		expect(stored?.addedAt).toBe("2026-10-27T03:15:00.000Z");
	});

	test("imports a purchase without addedAt", () => {
		expect(parseBackup(withPurchase({})).purchases[0]?.addedAt).toBeUndefined();
	});

	test("rejects a purchase whose addedAt is not an ISO instant", () => {
		for (const addedAt of [123, "yesterday"]) {
			const failure = captureThrow(() =>
				parseBackup(withPurchase({ addedAt })),
			);
			expect(failure).toBeInstanceOf(MessageError);
			expect((failure as MessageError).params).toEqual({
				index: 1,
				problem: "backup.problem.badAddedAt",
			});
		}
	});
});
