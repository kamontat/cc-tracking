import { describe, expect, test } from "bun:test";
import {
	normaliseRange,
	presetRange,
	purchasesInRange,
	rangeSummary,
	sittingPurchases,
} from "#lib/domain/purchase-range";
import type { Purchase } from "#lib/domain/types";

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
	id: "p1",
	cardId: "kbank",
	date: "2026-10-10",
	amount: 10_000,
	note: "",
	...overrides,
});

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

describe("purchasesInRange", () => {
	const all = [
		purchase({ id: "a", date: "2026-10-01" }),
		purchase({ id: "b", date: "2026-10-05", cardId: "scb" }),
		purchase({ id: "c", date: "2026-10-31" }),
		purchase({ id: "d", date: "2026-11-01" }),
	];
	const ids = (list: Purchase[]) => list.map((entry) => entry.id);

	test("includes both ends, newest purchase date first", () => {
		expect(
			ids(purchasesInRange(all, { from: "2026-10-01", to: "2026-10-31" })),
		).toEqual(["c", "b", "a"]);
	});

	test("an open end includes everything on that side", () => {
		expect(ids(purchasesInRange(all, { from: "2026-10-05", to: "" }))).toEqual([
			"d",
			"c",
			"b",
		]);
		expect(ids(purchasesInRange(all, { from: "", to: "" }))).toEqual([
			"d",
			"c",
			"b",
			"a",
		]);
	});

	test("a reversed range still finds the purchases between", () => {
		expect(
			ids(purchasesInRange(all, { from: "2026-10-31", to: "2026-10-01" })),
		).toEqual(["c", "b", "a"]);
	});

	test("a card narrows it", () => {
		expect(ids(purchasesInRange(all, { from: "", to: "" }, "scb"))).toEqual([
			"b",
		]);
	});

	test("same-day purchases put the latest entered first", () => {
		const sameDay = [
			purchase({ id: "x", addedAt: "2026-10-10T01:00:00.000Z" }),
			purchase({ id: "y", addedAt: "2026-10-10T02:00:00.000Z" }),
		];
		expect(ids(purchasesInRange(sameDay, { from: "", to: "" }))).toEqual([
			"y",
			"x",
		]);
	});
});

describe("rangeSummary", () => {
	test("counts purchases, sums amounts and counts cards", () => {
		expect(
			rangeSummary([
				purchase({ id: "a", amount: 10_000 }),
				purchase({ id: "b", amount: 2_550, cardId: "scb" }),
				purchase({ id: "c", amount: 100 }),
			]),
		).toEqual({ count: 3, total: 12_650, cards: 2 });
	});

	test("an empty list is all zeros", () => {
		expect(rangeSummary([])).toEqual({ count: 0, total: 0, cards: 0 });
	});
});

describe("sittingPurchases", () => {
	const since = "2026-10-27T03:00:00.000Z";

	test("keeps only purchases entered since the batch started, newest entered first", () => {
		const list = sittingPurchases(
			[
				purchase({ id: "old", addedAt: "2026-10-27T02:59:59.000Z" }),
				purchase({ id: "none" }),
				purchase({ id: "bad", addedAt: "not a time" }),
				purchase({
					id: "first",
					date: "2026-10-26",
					addedAt: "2026-10-27T03:00:00.000Z",
				}),
				purchase({
					id: "second",
					date: "2026-10-01",
					addedAt: "2026-10-27T03:05:00.000Z",
				}),
			],
			since,
		);
		expect(list.map((entry) => entry.id)).toEqual(["second", "first"]);
	});
});
