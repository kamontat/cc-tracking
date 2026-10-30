import { describe, expect, test } from "bun:test";
import {
	cardLedger,
	ledgerUrgency,
	newlyFrozen,
	nextBill,
} from "#lib/domain/ledger";
import type {
	Card,
	CardLedger,
	CardPayment,
	LedgerStatement,
	Purchase,
	StatementDates,
} from "#lib/domain/types";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 25 },
	archived: false,
};

const TODAY = "2026-10-30";

const purchase = (id: string, date: string, amount: number): Purchase => ({
	id,
	cardId: "kbank",
	date,
	amount,
	note: `purchase ${id}`,
});

const payment = (
	id: string,
	amount: number,
	extra: Partial<CardPayment> = {},
): CardPayment => ({
	id,
	cardId: "kbank",
	date: "2026-10-01",
	amount,
	status: "paid",
	...extra,
});

const ledger = (
	purchases: Purchase[],
	payments: CardPayment[],
	frozen: StatementDates[] = [],
) => cardLedger(card, purchases, payments, frozen, TODAY);

const of = (l: CardLedger, period: string) => {
	const found = l.statements.find((s) => s.period === period);
	if (!found) throw new Error(`no statement for ${period}`);
	return found;
};

const augSep = [
	purchase("a", "2026-08-05", 1_000),
	purchase("b", "2026-09-05", 2_000),
];

describe("cardLedger", () => {
	test("pays the oldest statement first", () => {
		const l = ledger(augSep, [payment("p", 1_500)]);
		expect(of(l, "2026-08").remaining).toBe(0);
		expect(of(l, "2026-08").paid).toBe(true);
		expect(of(l, "2026-09").remaining).toBe(1_500);
		expect(l.owed).toBe(1_500);
		expect(l.credit).toBe(0);
	});

	test("settles the open period too", () => {
		const l = ledger(
			[purchase("a", "2026-10-20", 3_000)],
			[payment("p", 3_000)],
		);
		const s = of(l, "2026-11");
		expect(s.paid).toBe(true);
		expect(s.open).toBe(true);
		expect(l.owed).toBe(0);
	});

	test("exact payment leaves no credit", () => {
		const l = ledger(
			[purchase("a", "2026-08-05", 1_000), purchase("b", "2026-10-20", 3_000)],
			[payment("p", 4_000)],
		);
		expect(l.owed).toBe(0);
		expect(l.credit).toBe(0);
		expect(l.statements.every((s) => s.paid)).toBe(true);
	});

	test("extra money becomes credit", () => {
		const l = ledger(
			[purchase("a", "2026-08-05", 1_000)],
			[payment("p", 1_500)],
		);
		expect(l.credit).toBe(500);
		expect(l.owed).toBe(0);
	});

	test("credit pays later purchases", () => {
		const pay = [payment("p", 2_000)];
		expect(ledger([], pay).credit).toBe(2_000);
		const l = ledger([purchase("a", "2026-10-15", 1_200)], pay);
		expect(l.credit).toBe(800);
		expect(l.owed).toBe(0);
	});

	test("planned payments change nothing", () => {
		const l = ledger(
			[purchase("a", "2026-08-05", 1_000)],
			[payment("p", 1_000, { status: "planned" })],
		);
		expect(l.owed).toBe(1_000);
		expect(l.credit).toBe(0);
	});

	test("a payment with a period pays that statement first", () => {
		const l = ledger(augSep, [payment("p", 2_000, { period: "2026-09" })]);
		expect(of(l, "2026-09").paid).toBe(true);
		expect(of(l, "2026-08").remaining).toBe(1_000);
	});

	test("overflow from a period payment joins the pool", () => {
		const l = ledger(augSep, [payment("p", 2_500, { period: "2026-09" })]);
		expect(of(l, "2026-09").paid).toBe(true);
		expect(of(l, "2026-08").remaining).toBe(500);
	});

	test("frozen dates win over the cycle", () => {
		const l = ledger(
			augSep,
			[],
			[
				{
					cardId: "kbank",
					period: "2026-09",
					closeDate: "2026-09-12",
					dueDate: "2026-10-07",
				},
			],
		);
		expect(of(l, "2026-09").closeDate).toBe("2026-09-12");
		expect(of(l, "2026-09").dueDate).toBe("2026-10-07");
		expect(of(l, "2026-08").closeDate).toBe("2026-08-10");
	});

	test("statements are newest first", () => {
		const l = ledger(augSep, []);
		expect(l.statements.map((s) => s.period)).toEqual([
			"2026-11",
			"2026-09",
			"2026-08",
		]);
	});
});

describe("newlyFrozen", () => {
	test("names statements first reached by money", () => {
		const l = ledger(augSep, [payment("p", 500)]);
		const result = newlyFrozen(card, l, []);
		expect(result).toHaveLength(1);
		expect(result[0]?.period).toBe("2026-08");
		expect(result[0]?.closeDate).toBe(of(l, "2026-08").closeDate);
		expect(result[0]?.dueDate).toBe(of(l, "2026-08").dueDate);
	});

	test("skips statements that already have a record", () => {
		const l = ledger(augSep, [payment("p", 500)]);
		const frozen = newlyFrozen(card, l, []);
		expect(newlyFrozen(card, l, frozen)).toEqual([]);
	});
});

const stmt = (
	period: string,
	extra: Partial<LedgerStatement> = {},
): LedgerStatement => ({
	cardId: "kbank",
	period,
	closeDate: "2026-09-10",
	dueDate: "2026-10-05",
	purchases: [],
	total: 1_000,
	paidAmount: 0,
	remaining: 1_000,
	paid: false,
	open: false,
	...extra,
});

describe("ledgerUrgency", () => {
	test("overdue after the due date", () => {
		expect(ledgerUrgency(stmt("2026-08"), TODAY)).toBe("overdue");
	});

	test("soon within 7 days", () => {
		const s = stmt("2026-09", { dueDate: "2026-11-04" });
		expect(ledgerUrgency(s, TODAY)).toBe("soon");
	});

	test("due further out", () => {
		const s = stmt("2026-09", { dueDate: "2026-11-20" });
		expect(ledgerUrgency(s, TODAY)).toBe("due");
	});

	test("open period is open even when owed", () => {
		const s = stmt("2026-10", {
			open: true,
			closeDate: "2026-11-10",
			dueDate: "2026-12-05",
		});
		expect(ledgerUrgency(s, TODAY)).toBe("open");
	});

	test("empty statement is never overdue", () => {
		const s = stmt("2026-08", { total: 0, remaining: 0 });
		expect(ledgerUrgency(s, TODAY)).toBe("paid");
	});

	test("a settled statement is paid", () => {
		const s = stmt("2026-08", { paidAmount: 1_000, remaining: 0, paid: true });
		expect(ledgerUrgency(s, TODAY)).toBe("paid");
	});
});

describe("nextBill", () => {
	test("nextBill skips the open period", () => {
		const l: CardLedger = {
			statements: [
				stmt("2026-10", { open: true }),
				stmt("2026-09"),
				stmt("2026-08"),
			],
			owed: 3_000,
			credit: 0,
		};
		expect(nextBill(l)?.period).toBe("2026-08");
	});

	test("nextBill is null when nothing closed is owed", () => {
		const l: CardLedger = {
			statements: [
				stmt("2026-10", { open: true }),
				stmt("2026-09", { remaining: 0, paid: true }),
			],
			owed: 1_000,
			credit: 0,
		};
		expect(nextBill(l)).toBeNull();
	});
});
