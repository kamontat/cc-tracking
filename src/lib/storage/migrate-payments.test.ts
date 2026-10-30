import { expect, test } from "bun:test";
import { cardLedger } from "#lib/domain/ledger";
import { buildStatement } from "#lib/domain/statement";
import type { CardPayment, Period } from "#lib/domain/types";
import {
	sampleCard,
	samplePayment,
	samplePurchase,
} from "#lib/storage/contract";
import {
	convertPayments,
	migratePayments,
	PAYMENTS_MIGRATION_KEY,
} from "#lib/storage/migrate-payments";
import { InMemoryRepository } from "#lib/storage/repository";

// Card closes on the 18th: a purchase on 2026-09-05 is in period 2026-09.
const card = sampleCard();
const TODAY = "2026-10-30";

const freshStorage = (): Storage => {
	globalThis.localStorage.clear();
	return globalThis.localStorage;
};

test("one payment per part", () => {
	const purchases = [samplePurchase({ id: "p1", amount: 10_000 })];
	const old = [
		samplePayment({
			parts: [
				{ paidAt: "2026-09-25", amount: 4_000 },
				{ paidAt: "2026-10-01", amount: 6_000 },
			],
		}),
	];

	const { payments } = convertPayments([card], purchases, old);

	expect(payments).toEqual([
		{
			id: "m:kbank:2026-09:0",
			cardId: "kbank",
			date: "2026-09-25",
			amount: 4_000,
			status: "paid",
			period: "2026-09",
		},
		{
			id: "m:kbank:2026-09:1",
			cardId: "kbank",
			date: "2026-10-01",
			amount: 6_000,
			status: "paid",
			period: "2026-09",
		},
	]);
});

test("a record without parts pays the current total", () => {
	const purchases = [
		samplePurchase({ id: "p1", amount: 10_000 }),
		samplePurchase({ id: "p2", date: "2026-09-10", amount: 2_550 }),
	];
	const old = [samplePayment({ paidAt: "2026-10-01" })];

	const { payments } = convertPayments([card], purchases, old);

	expect(payments).toEqual([
		{
			id: "m:kbank:2026-09:0",
			cardId: "kbank",
			date: "2026-10-01",
			amount: 12_550,
			status: "paid",
			period: "2026-09",
		},
	]);
});

test("a record without parts on an empty statement gives no payment", () => {
	const old = [samplePayment({ period: "2026-08" })];

	const { payments, dates } = convertPayments([card], [], old);

	expect(payments).toEqual([]);
	expect(dates).toHaveLength(1);
});

test("frozen dates come from the old record", () => {
	// Dates that differ from what the card's cycle now computes, as after a cycle edit.
	const old = [
		samplePayment({
			period: "2026-09",
			closeDate: "2026-09-20",
			dueDate: "2026-10-07",
		}),
		samplePayment({
			period: "2026-08",
			closeDate: "2026-08-20",
			dueDate: "2026-09-07",
		}),
	];

	const { dates } = convertPayments([card], [], old);

	expect(dates).toEqual([
		{
			cardId: "kbank",
			period: "2026-09",
			closeDate: "2026-09-20",
			dueDate: "2026-10-07",
		},
		{
			cardId: "kbank",
			period: "2026-08",
			closeDate: "2026-08-20",
			dueDate: "2026-09-07",
		},
	]);
});

// 2026-07: older, partly paid. 2026-08: older, unpaid, no record. 2026-09: newer, paid in
// full by a record without parts. 2026-10: closed, unpaid. 2026-11: open on TODAY, unpaid.
const mixedPurchases = [
	samplePurchase({ id: "a", date: "2026-07-05", amount: 30_000 }),
	samplePurchase({ id: "b", date: "2026-08-05", amount: 20_000 }),
	samplePurchase({ id: "c", date: "2026-09-05", amount: 15_000 }),
	samplePurchase({ id: "d", date: "2026-09-12", amount: 5_000 }),
	samplePurchase({ id: "e", date: "2026-10-10", amount: 7_000 }),
	samplePurchase({ id: "f", date: "2026-10-25", amount: 1_500 }),
];
const mixedOld = [
	samplePayment({
		period: "2026-07",
		closeDate: "2026-07-18",
		dueDate: "2026-08-02",
		paidAt: "2026-08-01",
		parts: [
			{ paidAt: "2026-07-25", amount: 5_000 },
			{ paidAt: "2026-08-01", amount: 7_000 },
		],
	}),
	samplePayment({ period: "2026-09", paidAt: "2026-10-02" }),
];
const mixedPeriods: Period[] = [
	"2026-07",
	"2026-08",
	"2026-09",
	"2026-10",
	"2026-11",
];

/** Asserts the ledger over `payments` shows each period as the old model did. */
const expectSameAsOldModel = (payments: CardPayment[]) => {
	const { dates } = convertPayments([card], mixedPurchases, mixedOld);
	const ledger = cardLedger(card, mixedPurchases, payments, dates, TODAY);

	expect(ledger.statements.map((s) => s.period).sort()).toEqual(mixedPeriods);
	for (const period of mixedPeriods) {
		const before = buildStatement(
			card,
			period,
			mixedPurchases,
			mixedOld.find((r) => r.period === period) ?? null,
		);
		const after = ledger.statements.find((s) => s.period === period);
		expect({ period, paid: after?.paidAmount, left: after?.remaining }).toEqual(
			{
				period,
				paid: before.paidAmount,
				left: before.remaining,
			},
		);
		expect(after?.closeDate).toBe(before.closeDate);
		expect(after?.dueDate).toBe(before.dueDate);
	}
	expect(ledger.credit).toBe(0);
	return ledger;
};

test("every statement keeps its paid and left amounts", () => {
	const { payments } = convertPayments([card], mixedPurchases, mixedOld);

	const ledger = expectSameAsOldModel(payments);
	expect(ledger.statements.find((s) => s.period === "2026-09")?.paid).toBe(
		true,
	);
	expect(ledger.statements.find((s) => s.period === "2026-08")?.remaining).toBe(
		20_000,
	);
});

test("an overpaid record converts to exactly the total and leaves no credit", () => {
	const purchases = [
		samplePurchase({ id: "a", date: "2026-08-05", amount: 20_000 }),
		samplePurchase({ id: "c", date: "2026-09-05", amount: 10_000 }),
	];
	// 2026-09 total is 10_000 but its parts sum to 16_000. The old app showed it paid
	// with nothing carried over; 2026-08 stayed unpaid.
	const old = [
		samplePayment({
			period: "2026-09",
			paidAt: "2026-10-03",
			parts: [
				{ paidAt: "2026-09-25", amount: 7_000 },
				{ paidAt: "2026-10-01", amount: 5_000 },
				{ paidAt: "2026-10-03", amount: 4_000 },
			],
		}),
	];

	const { payments, dates } = convertPayments([card], purchases, old);

	// The excess goes from the latest parts first; a part left at zero is dropped.
	expect(payments.map((p) => [p.id, p.date, p.amount])).toEqual([
		["m:kbank:2026-09:0", "2026-09-25", 7_000],
		["m:kbank:2026-09:1", "2026-10-01", 3_000],
	]);
	expect(payments.reduce((sum, p) => sum + p.amount, 0)).toBe(10_000);

	const ledger = cardLedger(card, purchases, payments, dates, TODAY);
	const september = ledger.statements.find((s) => s.period === "2026-09");
	expect(september?.paid).toBe(true);
	expect(september?.remaining).toBe(0);
	expect(ledger.statements.find((s) => s.period === "2026-08")?.remaining).toBe(
		20_000,
	);
	expect(ledger.credit).toBe(0);
});

test("a record for a card that no longer exists is skipped", () => {
	const old = [
		samplePayment({
			cardId: "gone",
			parts: [{ paidAt: "2026-10-01", amount: 1_000 }],
		}),
	];

	expect(convertPayments([card], [], old)).toEqual({
		payments: [],
		dates: [],
	});
});

const seededRepo = async (): Promise<InMemoryRepository> => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.saveCard(sampleCard({ id: "scb", name: "SCB" }));
	await repo.savePurchase(samplePurchase({ id: "p1", amount: 10_000 }));
	await repo.savePurchase(
		samplePurchase({ id: "q1", cardId: "scb", amount: 3_000 }),
	);
	await repo.savePayment(
		samplePayment({
			parts: [
				{ paidAt: "2026-09-25", amount: 4_000 },
				{ paidAt: "2026-10-01", amount: 6_000 },
			],
		}),
	);
	await repo.savePayment(samplePayment({ cardId: "scb" }));
	return repo;
};

test("running twice converts once", async () => {
	const repo = await seededRepo();
	const storage = freshStorage();

	expect(await migratePayments(repo, storage)).toBe(3);
	expect(storage.getItem(PAYMENTS_MIGRATION_KEY)).toBe("done");
	expect(await migratePayments(repo, storage)).toBe(0);

	const kbank = await repo.listCardPayments("kbank");
	expect(kbank.map((p) => [p.id, p.amount])).toEqual([
		["m:kbank:2026-09:0", 4_000],
		["m:kbank:2026-09:1", 6_000],
	]);
	expect((await repo.listCardPayments("scb")).map((p) => p.amount)).toEqual([
		3_000,
	]);
	expect(await repo.listStatementDates("kbank")).toEqual([
		{
			cardId: "kbank",
			period: "2026-09",
			closeDate: "2026-09-18",
			dueDate: "2026-10-03",
		},
	]);
	// The old records stay on disk.
	expect(await repo.listPayments("kbank")).toHaveLength(1);
});

test("does nothing, reading nothing, once the marker is set", async () => {
	const repo = await seededRepo();
	const storage = freshStorage();
	storage.setItem(PAYMENTS_MIGRATION_KEY, "done");
	repo.listCards = async () => {
		throw new Error("read after the marker");
	};

	expect(await migratePayments(repo, storage)).toBe(0);
	expect(await repo.listCardPayments("kbank")).toEqual([]);
});

test("a failed write leaves no marker, and the rerun finishes without duplicates", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	for (const purchase of mixedPurchases) await repo.savePurchase(purchase);
	for (const record of mixedOld) await repo.savePayment(record);
	const storage = freshStorage();

	// The second payment write throws once: the first is already saved.
	const save = repo.saveCardPayment.bind(repo);
	let writes = 0;
	repo.saveCardPayment = async (payment: CardPayment) => {
		if (++writes === 2) throw new Error("storage full");
		await save(payment);
	};

	await expect(migratePayments(repo, storage)).rejects.toThrow("storage full");
	expect(await repo.listCardPayments("kbank")).toHaveLength(1);
	expect(storage.getItem(PAYMENTS_MIGRATION_KEY)).toBeNull();

	expect(await migratePayments(repo, storage)).toBe(3);
	expect(storage.getItem(PAYMENTS_MIGRATION_KEY)).toBe("done");

	const saved = await repo.listCardPayments("kbank");
	expect(saved).toHaveLength(3);
	expectSameAsOldModel(saved);
});

test("deleted card payments do not come back", async () => {
	const repo = await seededRepo();
	const storage = freshStorage();

	expect(await migratePayments(repo, storage)).toBe(3);
	for (const cardId of ["kbank", "scb"]) {
		for (const payment of await repo.listCardPayments(cardId)) {
			await repo.deleteCardPayment(cardId, payment.id);
		}
	}

	expect(await migratePayments(repo, storage)).toBe(0);
	expect(await repo.listCardPayments("kbank")).toEqual([]);
	expect(await repo.listCardPayments("scb")).toEqual([]);
});

test("old records that give no payments still finish once", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePayment(samplePayment({ period: "2026-08" }));
	const storage = freshStorage();

	expect(await migratePayments(repo, storage)).toBe(0);
	expect(storage.getItem(PAYMENTS_MIGRATION_KEY)).toBe("done");

	await repo.deleteStatementDates("kbank", "2026-08");
	expect(await migratePayments(repo, storage)).toBe(0);
	expect(await repo.listStatementDates("kbank")).toEqual([]);
});
