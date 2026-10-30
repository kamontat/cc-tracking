import { expect, test } from "bun:test";
import { cardLedger } from "#lib/domain/ledger";
import { buildStatement } from "#lib/domain/statement";
import type { Period } from "#lib/domain/types";
import {
	sampleCard,
	sampleCardPayment,
	samplePayment,
	samplePurchase,
} from "#lib/storage/contract";
import {
	convertPayments,
	migratePayments,
} from "#lib/storage/migrate-payments";
import { InMemoryRepository } from "#lib/storage/repository";

/** Hands out "n1", "n2", ... so converted ids are predictable. */
const counter = () => {
	let next = 0;
	return () => `n${++next}`;
};

// Card closes on the 18th: a purchase on 2026-09-05 is in period 2026-09.
const card = sampleCard();
const TODAY = "2026-10-30";

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

	const { payments } = convertPayments([card], purchases, old, counter());

	expect(payments).toEqual([
		{
			id: "n1",
			cardId: "kbank",
			date: "2026-09-25",
			amount: 4_000,
			status: "paid",
			period: "2026-09",
		},
		{
			id: "n2",
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

	const { payments } = convertPayments([card], purchases, old, counter());

	expect(payments).toEqual([
		{
			id: "n1",
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

	const { payments, dates } = convertPayments([card], [], old, counter());

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

	const { dates } = convertPayments([card], [], old, counter());

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

test("every statement keeps its paid and left amounts", () => {
	const purchases = [
		// 2026-07: older, partly paid.
		samplePurchase({ id: "a", date: "2026-07-05", amount: 30_000 }),
		// 2026-08: older, unpaid, no record.
		samplePurchase({ id: "b", date: "2026-08-05", amount: 20_000 }),
		// 2026-09: newer, paid in full by a record without parts.
		samplePurchase({ id: "c", date: "2026-09-05", amount: 15_000 }),
		samplePurchase({ id: "d", date: "2026-09-12", amount: 5_000 }),
		// 2026-10: closed, unpaid.
		samplePurchase({ id: "e", date: "2026-10-10", amount: 7_000 }),
		// 2026-11: the open period on TODAY, unpaid.
		samplePurchase({ id: "f", date: "2026-10-25", amount: 1_500 }),
	];
	const old = [
		samplePayment({
			period: "2026-07",
			closeDate: "2026-07-18",
			dueDate: "2026-08-02",
			paidAt: "2026-08-01",
			parts: [{ paidAt: "2026-08-01", amount: 12_000 }],
		}),
		samplePayment({ period: "2026-09", paidAt: "2026-10-02" }),
	];

	const { payments, dates } = convertPayments(
		[card],
		purchases,
		old,
		counter(),
	);
	const ledger = cardLedger(card, purchases, payments, dates, TODAY);

	const periods: Period[] = [
		"2026-07",
		"2026-08",
		"2026-09",
		"2026-10",
		"2026-11",
	];
	expect(ledger.statements.map((s) => s.period).sort()).toEqual(periods);
	for (const period of periods) {
		const before = buildStatement(
			card,
			period,
			purchases,
			old.find((r) => r.period === period) ?? null,
		);
		const after = ledger.statements.find((s) => s.period === period);
		expect({ period, paid: after?.paidAmount, left: after?.remaining }).toEqual(
			{ period, paid: before.paidAmount, left: before.remaining },
		);
		expect(after?.closeDate).toBe(before.closeDate);
		expect(after?.dueDate).toBe(before.dueDate);
	}
	expect(ledger.statements.find((s) => s.period === "2026-09")?.paid).toBe(
		true,
	);
	expect(ledger.statements.find((s) => s.period === "2026-08")?.remaining).toBe(
		20_000,
	);
	expect(ledger.credit).toBe(0);
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

	const { payments, dates } = convertPayments(
		[card],
		purchases,
		old,
		counter(),
	);

	// The excess goes from the latest parts first; a part left at zero is dropped.
	expect(payments.map((p) => [p.date, p.amount])).toEqual([
		["2026-09-25", 7_000],
		["2026-10-01", 3_000],
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

	expect(convertPayments([card], [], old, counter())).toEqual({
		payments: [],
		dates: [],
	});
});

test("running twice converts once", async () => {
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

	expect(await migratePayments(repo, counter())).toBe(3);
	expect(await migratePayments(repo, counter())).toBe(0);

	const kbank = await repo.listCardPayments("kbank");
	expect(kbank.map((p) => p.amount)).toEqual([4_000, 6_000]);
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

test("does nothing once any card has a card payment", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.saveCard(sampleCard({ id: "scb", name: "SCB" }));
	await repo.savePurchase(samplePurchase({ id: "p1", amount: 10_000 }));
	await repo.savePayment(samplePayment());
	await repo.saveCardPayment(sampleCardPayment({ cardId: "scb" }));

	expect(await migratePayments(repo, counter())).toBe(0);
	expect(await repo.listCardPayments("kbank")).toEqual([]);
	expect(await repo.listStatementDates("kbank")).toEqual([]);
});
