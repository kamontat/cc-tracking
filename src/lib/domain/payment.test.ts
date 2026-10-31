import { describe, expect, test } from "bun:test";
import { partsOf } from "#lib/domain/payment";
import type { StatementPayment } from "#lib/domain/types";

const legacy: StatementPayment = {
	cardId: "kbank",
	period: "2026-09",
	paidAt: "2026-10-01",
	closeDate: "2026-09-18",
	dueDate: "2026-10-03",
};

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
