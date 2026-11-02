import { describe, expect, test } from "bun:test";
import { buildStatement, recentPeriods } from "#lib/domain/statement";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const purchase = (id: string, date: string, amount: number): Purchase => ({
	id,
	cardId: "kbank",
	date,
	amount,
	note: `purchase ${id}`,
});

const purchases = [
	purchase("a", "2026-09-05", 10_000),
	purchase("b", "2026-09-18", 25_000), // on the close date: September
	purchase("c", "2026-09-19", 50_000), // after it: October
];

describe("buildStatement", () => {
	test("collects the period's purchases and totals them", () => {
		const statement = buildStatement(card, "2026-09", purchases);
		expect(statement.purchases.map((p) => p.id)).toEqual(["a", "b"]);
		expect(statement.total).toBe(35_000);
	});

	test("computes close and due dates from the card's rule", () => {
		const statement = buildStatement(card, "2026-09", purchases);
		expect(statement.closeDate).toBe("2026-09-18");
		expect(statement.dueDate).toBe("2026-10-03");
	});

	test("is unpaid with no payment record", () => {
		expect(buildStatement(card, "2026-09", purchases).paid).toBe(false);
	});

	test("prefers the payment's frozen dates over recomputed ones", () => {
		const payment: StatementPayment = {
			cardId: "kbank",
			period: "2026-09",
			paidAt: "2026-10-01",
			closeDate: "2026-09-15", // the rule said the 15th back then
			dueDate: "2026-09-30",
		};
		const statement = buildStatement(card, "2026-09", purchases, payment);
		expect(statement.paid).toBe(true);
		expect(statement.closeDate).toBe("2026-09-15");
		expect(statement.dueDate).toBe("2026-09-30");
		expect(statement.payment).toBe(payment);
	});

	test("a payment for part of the total leaves the rest owing", () => {
		const payment: StatementPayment = {
			cardId: "kbank",
			period: "2026-09",
			paidAt: "2026-10-01",
			closeDate: "2026-09-18",
			dueDate: "2026-10-03",
			parts: [{ paidAt: "2026-10-01", amount: 15_000 }],
		};
		const statement = buildStatement(card, "2026-09", purchases, payment);
		expect(statement.paid).toBe(false);
		expect(statement.paidAmount).toBe(15_000);
		expect(statement.remaining).toBe(20_000);
	});

	test("payments adding up to the total settle it", () => {
		const payment: StatementPayment = {
			cardId: "kbank",
			period: "2026-09",
			paidAt: "2026-10-02",
			closeDate: "2026-09-18",
			dueDate: "2026-10-03",
			parts: [
				{ paidAt: "2026-10-01", amount: 15_000 },
				{ paidAt: "2026-10-02", amount: 20_000 },
			],
		};
		const statement = buildStatement(card, "2026-09", purchases, payment);
		expect(statement.paid).toBe(true);
		expect(statement.remaining).toBe(0);
	});

	test("a payment from before partial payments covers the whole total", () => {
		const payment: StatementPayment = {
			cardId: "kbank",
			period: "2026-09",
			paidAt: "2026-10-01",
			closeDate: "2026-09-18",
			dueDate: "2026-10-03",
		};
		const statement = buildStatement(card, "2026-09", purchases, payment);
		expect(statement.paidAmount).toBe(35_000);
		expect(statement.remaining).toBe(0);
	});

	test("is empty, not broken, for a period with no purchases", () => {
		const statement = buildStatement(card, "2026-07", purchases);
		expect(statement.purchases).toEqual([]);
		expect(statement.total).toBe(0);
	});
});

describe("recentPeriods", () => {
	test("returns periods newest first, starting from the open one", () => {
		// 2026-09-21 is past the 18th, so the open period is October.
		expect(recentPeriods(card, "2026-09-21", 3)).toEqual([
			"2026-10",
			"2026-09",
			"2026-08",
		]);
	});

	test("returns the open period alone when asked for one", () => {
		expect(recentPeriods(card, "2026-09-10", 1)).toEqual(["2026-09"]);
	});
});

describe("a fixed-rule card", () => {
	// Closes the 18th, due day 5 <= close day 18, so due date rolls into the next month.
	const fixedCard: Card = {
		id: "scb",
		name: "SCB Mastercard",
		last4: "1234",
		location: "bangkok",
		cycle: { kind: "fixed", closeDay: 18, dueDay: 5 },
		archived: false,
	};

	const fixedPurchases: Purchase[] = [
		{ id: "x", cardId: "scb", date: "2026-09-05", amount: 10_000, note: "x" },
		{ id: "y", cardId: "scb", date: "2026-09-18", amount: 25_000, note: "y" },
		{ id: "z", cardId: "scb", date: "2026-09-19", amount: 50_000, note: "z" },
	];

	test("buildStatement collects the period's purchases and computes fixed-rule dates", () => {
		const statement = buildStatement(fixedCard, "2026-09", fixedPurchases);
		expect(statement.purchases.map((p) => p.id)).toEqual(["x", "y"]);
		expect(statement.total).toBe(35_000);
		expect(statement.closeDate).toBe("2026-09-18");
		expect(statement.dueDate).toBe("2026-10-05");
	});
});
