import { describe, expect, test } from "bun:test";
import { addPart, partsOf, removePart } from "#lib/domain/payment";
import type { StatementPayment } from "#lib/domain/types";

const statement = {
	cardId: "kbank",
	period: "2026-09",
	closeDate: "2026-09-18",
	dueDate: "2026-10-03",
	total: 10_000_000,
};

const legacy: StatementPayment = {
	cardId: "kbank",
	period: "2026-09",
	paidAt: "2026-10-01",
	closeDate: "2026-09-18",
	dueDate: "2026-10-03",
};

describe("addPart", () => {
	test("starts a payment record from the statement's frozen dates", () => {
		const payment = addPart(null, statement, {
			paidAt: "2026-10-27",
			amount: 4_000_000,
		});
		expect(payment).toEqual({
			cardId: "kbank",
			period: "2026-09",
			paidAt: "2026-10-27",
			closeDate: "2026-09-18",
			dueDate: "2026-10-03",
			parts: [{ paidAt: "2026-10-27", amount: 4_000_000 }],
		});
	});

	test("keeps parts in date order with paidAt the latest", () => {
		const first = addPart(null, statement, {
			paidAt: "2026-11-03",
			amount: 6_000_000,
		});
		const both = addPart(first, statement, {
			paidAt: "2026-10-27",
			amount: 4_000_000,
		});
		expect(both.parts).toEqual([
			{ paidAt: "2026-10-27", amount: 4_000_000 },
			{ paidAt: "2026-11-03", amount: 6_000_000 },
		]);
		expect(both.paidAt).toBe("2026-11-03");
	});

	test("keeps the dates frozen by the first payment", () => {
		const first = addPart(null, statement, {
			paidAt: "2026-10-27",
			amount: 4_000_000,
		});
		const later = addPart(
			first,
			{ ...statement, closeDate: "2026-09-20", dueDate: "2026-10-05" },
			{ paidAt: "2026-11-03", amount: 6_000_000 },
		);
		expect(later.closeDate).toBe("2026-09-18");
		expect(later.dueDate).toBe("2026-10-03");
	});
});

describe("partsOf", () => {
	test("reads a record from before partial payments as one payment of the whole total", () => {
		expect(partsOf(legacy, 35_000)).toEqual([
			{ paidAt: "2026-10-01", amount: 35_000 },
		]);
	});

	test("is empty with no record", () => {
		expect(partsOf(null, 35_000)).toEqual([]);
	});
});

describe("removePart", () => {
	const payment = addPart(
		addPart(null, statement, { paidAt: "2026-10-27", amount: 4_000_000 }),
		statement,
		{ paidAt: "2026-11-03", amount: 6_000_000 },
	);

	test("drops the part at that index and moves paidAt to the latest left", () => {
		const left = removePart(payment, 1, statement.total);
		expect(left?.parts).toEqual([{ paidAt: "2026-10-27", amount: 4_000_000 }]);
		expect(left?.paidAt).toBe("2026-10-27");
	});

	test("returns null once the last part is gone", () => {
		const one = removePart(payment, 1, statement.total);
		expect(one && removePart(one, 0, statement.total)).toBeNull();
	});

	test("removing a legacy full payment leaves nothing", () => {
		expect(removePart(legacy, 0, 35_000)).toBeNull();
	});
});
