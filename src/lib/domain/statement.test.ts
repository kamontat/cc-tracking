import { describe, expect, test } from "bun:test";
import {
	buildStatement,
	nextActionable,
	recentPeriods,
	urgencyOf,
} from "#lib/domain/statement";
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

describe("nextActionable", () => {
	test("returns the oldest closed unpaid statement", () => {
		const statement = nextActionable(card, purchases, [], "2026-09-25");
		expect(statement.period).toBe("2026-09");
		expect(statement.paid).toBe(false);
	});

	test("skips a paid statement and moves to the next unpaid one", () => {
		const payments: StatementPayment[] = [
			{
				cardId: "kbank",
				period: "2026-09",
				paidAt: "2026-09-30",
				closeDate: "2026-09-18",
				dueDate: "2026-10-03",
			},
		];
		const statement = nextActionable(card, purchases, payments, "2026-09-25");
		expect(statement.period).toBe("2026-10");
	});

	test("returns the open period when nothing has closed unpaid", () => {
		const statement = nextActionable(card, [], [], "2026-09-10");
		expect(statement.period).toBe("2026-09");
		expect(statement.total).toBe(0);
	});

	test("skips empty periods and returns the first period with unpaid purchases", () => {
		// January has purchases and is paid; Feb-May are empty; June has a purchase.
		// From 2026-05-25, the open period is June; the walk should skip Feb-May empties
		// and return June's statement, not stop at February's empty ฿0.00.
		const januaryPayment: StatementPayment = {
			cardId: "kbank",
			period: "2026-01",
			paidAt: "2026-02-15",
			closeDate: "2026-01-18",
			dueDate: "2026-02-02",
		};
		const purchases2 = [
			purchase("jan", "2026-01-10", 50_000),
			purchase("jun", "2026-06-10", 100_000),
		];
		const statement = nextActionable(
			card,
			purchases2,
			[januaryPayment],
			"2026-05-25",
		);
		expect(statement.period).toBe("2026-06");
		expect(statement.total).toBe(100_000);
		expect(statement.paid).toBe(false);
	});
});

describe("urgencyOf", () => {
	// One statement: closes 18 Sep 2026, due 3 Oct 2026. Only "today" moves.
	const september = buildStatement(card, "2026-09", purchases);

	test("is future before the statement closes", () => {
		expect(urgencyOf(september, "2026-09-10")).toBe("future");
	});

	test("is future exactly on the close date", () => {
		expect(urgencyOf(september, "2026-09-18")).toBe("future");
	});

	test("is overdue after the due date", () => {
		expect(urgencyOf(september, "2026-10-04")).toBe("overdue");
	});

	test("is soon within seven days of the due date", () => {
		expect(urgencyOf(september, "2026-09-28")).toBe("soon");
	});

	test("is soon exactly seven days before the due date", () => {
		expect(urgencyOf(september, "2026-09-26")).toBe("soon");
	});

	test("is soon exactly on the due date, zero days out", () => {
		expect(urgencyOf(september, "2026-10-03")).toBe("soon");
	});

	test("is open when closed but still far from due", () => {
		expect(urgencyOf(september, "2026-09-19")).toBe("open");
	});

	test("is open once paid, however late", () => {
		const payment: StatementPayment = {
			cardId: "kbank",
			period: "2026-09",
			paidAt: "2026-10-05",
			closeDate: "2026-09-18",
			dueDate: "2026-10-03",
		};
		const paid = buildStatement(card, "2026-09", purchases, payment);
		expect(urgencyOf(paid, "2026-10-10")).toBe("open");
	});

	// A period nobody spent on owes nothing, so no date can make it late. This is the
	// rule nextActionable already applies when it decides what needs attention.
	test("is open for an empty statement long past its due date", () => {
		const empty = buildStatement(card, "2026-09", []);
		expect(urgencyOf(empty, "2026-10-04")).toBe("open");
	});

	test("is open for an empty statement inside the due-soon window", () => {
		const empty = buildStatement(card, "2026-09", []);
		expect(urgencyOf(empty, "2026-09-28")).toBe("open");
	});

	test("is still future for an empty statement that has not closed", () => {
		const empty = buildStatement(card, "2026-09", []);
		expect(urgencyOf(empty, "2026-09-10")).toBe("future");
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

	test("nextActionable finds the oldest closed unpaid statement", () => {
		const statement = nextActionable(
			fixedCard,
			fixedPurchases,
			[],
			"2026-09-25",
		);
		expect(statement.period).toBe("2026-09");
		expect(statement.paid).toBe(false);
	});

	test("urgencyOf tracks close and due dates", () => {
		const statement = buildStatement(fixedCard, "2026-09", fixedPurchases);
		expect(urgencyOf(statement, "2026-09-10")).toBe("future");
		expect(urgencyOf(statement, "2026-09-18")).toBe("future");
		expect(urgencyOf(statement, "2026-09-19")).toBe("open");
		expect(urgencyOf(statement, "2026-10-06")).toBe("overdue");
	});
});
