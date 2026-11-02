import { describe, expect, test } from "bun:test";
import { normaliseRange, presetRange } from "#lib/domain/purchase-range";

describe("presetRange", () => {
	// 2026-10-27 is a Tuesday.
	test("today is just today", () => {
		expect(presetRange("today", "2026-10-27")).toEqual({
			from: "2026-10-27",
			to: "2026-10-27",
		});
	});

	test("this week runs Monday to Sunday", () => {
		const week = { from: "2026-10-26", to: "2026-11-01" };
		expect(presetRange("week", "2026-10-27")).toEqual(week);
		expect(presetRange("week", "2026-10-26")).toEqual(week);
		expect(presetRange("week", "2026-11-01")).toEqual(week);
	});

	test("this month is the whole calendar month", () => {
		expect(presetRange("month", "2026-10-27")).toEqual({
			from: "2026-10-01",
			to: "2026-10-31",
		});
	});

	test("last month is the whole previous calendar month", () => {
		expect(presetRange("lastMonth", "2026-10-27")).toEqual({
			from: "2026-09-01",
			to: "2026-09-30",
		});
		expect(presetRange("lastMonth", "2026-01-15")).toEqual({
			from: "2025-12-01",
			to: "2025-12-31",
		});
	});
});

describe("normaliseRange", () => {
	test("swaps a range whose start is after its end", () => {
		expect(normaliseRange({ from: "2026-10-31", to: "2026-10-01" })).toEqual({
			from: "2026-10-01",
			to: "2026-10-31",
		});
	});

	test("leaves an open side open", () => {
		expect(normaliseRange({ from: "2026-10-31", to: "" })).toEqual({
			from: "2026-10-31",
			to: "",
		});
	});
});
