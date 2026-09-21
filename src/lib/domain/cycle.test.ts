import { describe, expect, test } from "bun:test";
import {
	closeDateOf,
	describeCycle,
	dueDateOf,
	periodOfPurchase,
} from "#lib/domain/cycle.ts";
import type { CycleRule } from "#lib/domain/types.ts";

const offset: CycleRule = { kind: "offset", closeDay: 18, dueOffsetDays: 15 };
const fixed: CycleRule = { kind: "fixed", closeDay: 18, dueDay: 5 };
const fixedSameMonth: CycleRule = { kind: "fixed", closeDay: 5, dueDay: 25 };
const endOfMonth: CycleRule = { kind: "fixed", closeDay: 31, dueDay: 31 };

describe("closeDateOf", () => {
	test("uses the close day of the period's month", () => {
		expect(closeDateOf(offset, "2026-09")).toBe("2026-09-18");
		expect(closeDateOf(fixed, "2026-09")).toBe("2026-09-18");
	});

	test("clamps a close day the month does not have", () => {
		expect(closeDateOf(endOfMonth, "2026-02")).toBe("2026-02-28");
		expect(closeDateOf(endOfMonth, "2026-04")).toBe("2026-04-30");
	});

	test("clamps into a leap-year February instead of a common one", () => {
		expect(closeDateOf(endOfMonth, "2028-02")).toBe("2028-02-29");
		expect(closeDateOf(endOfMonth, "2000-02")).toBe("2000-02-29"); // divisible by 400
		expect(closeDateOf(endOfMonth, "1900-02")).toBe("1900-02-28"); // century, not by 400
	});
});

describe("dueDateOf, offset rule", () => {
	test("adds the offset to the close date", () => {
		expect(dueDateOf(offset, "2026-09")).toBe("2026-10-03");
	});

	test("crosses a year boundary", () => {
		expect(dueDateOf(offset, "2026-12")).toBe("2027-01-02");
	});
});

describe("dueDateOf, fixed rule", () => {
	test("falls in the next month when the due day is not after the close day", () => {
		expect(dueDateOf(fixed, "2026-09")).toBe("2026-10-05");
	});

	test("falls in the same month when the due day is after the close day", () => {
		expect(dueDateOf(fixedSameMonth, "2026-09")).toBe("2026-09-25");
	});

	test("crosses a year boundary", () => {
		expect(dueDateOf(fixed, "2026-12")).toBe("2027-01-05");
	});

	test("clamps a due day the target month does not have", () => {
		// Closes 31 Jan, due day 31 lands in February.
		expect(dueDateOf(endOfMonth, "2026-01")).toBe("2026-02-28");
	});
});

describe("periodOfPurchase", () => {
	test("a purchase before the close date belongs to that month's statement", () => {
		expect(periodOfPurchase(offset, "2026-09-05")).toBe("2026-09");
	});

	test("a purchase exactly on the close date belongs to that statement", () => {
		expect(periodOfPurchase(offset, "2026-09-18")).toBe("2026-09");
	});

	test("a purchase after the close date rolls into the next statement", () => {
		expect(periodOfPurchase(offset, "2026-09-19")).toBe("2026-10");
	});

	test("rolls across a year boundary", () => {
		expect(periodOfPurchase(offset, "2026-12-20")).toBe("2027-01");
	});

	test("respects a clamped close date", () => {
		// February 2026 closes on the 28th, so the 28th is still February's statement.
		expect(periodOfPurchase(endOfMonth, "2026-02-28")).toBe("2026-02");
	});
});

describe("describeCycle", () => {
	test("describes both kinds in words", () => {
		expect(describeCycle(offset)).toBe("closes 18th, due 15 days later");
		expect(describeCycle(fixed)).toBe("closes 18th, due on the 5th");
	});
});
