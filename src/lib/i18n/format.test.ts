import { expect, test } from "vitest";
import {
	describeCycleText,
	locationName,
	nameOfLocation,
	placeOrder,
	purchasePlaces,
	relativeDayText,
	sortLocations,
} from "#lib/i18n/format";
import { setLocale } from "#lib/i18n/index";

test("writes an English ordinal for the closing day", () => {
	setLocale("en");
	expect(
		describeCycleText({ kind: "offset", closeDay: 18, dueOffsetDays: 15 }),
	).toBe("closes 18th, due 15 days later");
	expect(describeCycleText({ kind: "fixed", closeDay: 1, dueDay: 22 })).toBe(
		"closes 1st, due on the 22nd",
	);
});

test("writes the irregular English ordinals for 11, 12, and 13", () => {
	setLocale("en");
	expect(describeCycleText({ kind: "fixed", closeDay: 11, dueDay: 12 })).toBe(
		"closes 11th, due on the 12th",
	);
	expect(
		describeCycleText({ kind: "offset", closeDay: 13, dueOffsetDays: 15 }),
	).toBe("closes 13th, due 15 days later");
});

test("writes a plain number in Thai, where an ordinal suffix has no meaning", () => {
	setLocale("th");
	expect(
		describeCycleText({ kind: "offset", closeDay: 18, dueOffsetDays: 15 }),
	).toBe("สรุปยอดวันที่ 18 ครบกำหนดอีก 15 วัน");
	expect(describeCycleText({ kind: "fixed", closeDay: 18, dueDay: 5 })).toBe(
		"สรุปยอดวันที่ 18 ครบกำหนดวันที่ 5",
	);
});

test("names the same day rather than counting zero days to it", () => {
	setLocale("en");
	expect(relativeDayText("2026-09-23", "2026-09-23")).toBe("today");
	setLocale("th");
	expect(relativeDayText("2026-09-23", "2026-09-23")).toBe("วันนี้");
});

test("counts forward to a date still ahead", () => {
	setLocale("en");
	expect(relativeDayText("2026-09-23", "2026-09-25")).toBe("in 2 days");
	setLocale("th");
	expect(relativeDayText("2026-09-23", "2026-09-25")).toBe("อีก 2 วัน");
});

test("counts backward to a date already past, without calling it overdue", () => {
	setLocale("en");
	expect(relativeDayText("2026-09-23", "2026-09-21")).toBe("2 days ago");
	setLocale("th");
	expect(relativeDayText("2026-09-23", "2026-09-21")).toBe("2 วันก่อน");
});

test("counts across a month boundary", () => {
	setLocale("en");
	expect(relativeDayText("2026-09-23", "2026-10-02")).toBe("in 9 days");
});

test("names an untouched default location in the reader's language", () => {
	setLocale("en");
	expect(locationName({ id: "krabi", name: "Krabi" })).toBe("Krabi");
	setLocale("th");
	expect(locationName({ id: "krabi", name: "Krabi" })).toBe("กระบี่");
});

test("keeps the stored name for a renamed default and for a custom location", () => {
	setLocale("th");
	expect(locationName({ id: "krabi", name: "Ao Nang" })).toBe("Ao Nang");
	expect(locationName({ id: "loc-1", name: "Ayutthaya" })).toBe("Ayutthaya");
});

test("lists locations A to Z by shown name", () => {
	setLocale("en");
	const records = [
		{ id: "phichit", name: "Phichit" },
		{ id: "loc-1", name: "Ayutthaya" },
		{ id: "krabi", name: "Krabi" },
		{ id: "bangkok", name: "Bangkok" },
	];
	expect(sortLocations(records).map((r) => r.name)).toEqual([
		"Ayutthaya",
		"Bangkok",
		"Krabi",
		"Phichit",
	]);
	expect(records[0]?.id).toBe("phichit");
});

test("place order: records A to Z, then each used id with no record, by id, once", () => {
	setLocale("en");
	const records = [
		{ id: "phichit", name: "Phichit", takesPurchases: false },
		{ id: "loc-1", name: "Ayutthaya", takesPurchases: false },
	];
	expect(placeOrder(records, ["zz", "phichit", "aa", "zz"])).toEqual([
		"loc-1",
		"phichit",
		"aa",
		"zz",
	]);
});

test("falls back to the id when no record matches", () => {
	setLocale("en");
	const records = [{ id: "krabi", name: "Krabi", takesPurchases: true }];
	expect(nameOfLocation(records, "krabi")).toBe("Krabi");
	expect(nameOfLocation(records, "gone")).toBe("gone");
});

test("names the places that take purchases, A to Z in the reader's language", () => {
	const records = [
		{ id: "krabi", name: "Krabi", takesPurchases: true },
		{ id: "bangkok", name: "Bangkok", takesPurchases: false },
		{ id: "chiang-mai", name: "Chiang Mai", takesPurchases: true },
	];
	setLocale("en");
	expect(purchasePlaces(records)).toEqual(["Chiang Mai", "Krabi"]);
	setLocale("th");
	expect(purchasePlaces(records)).toEqual(["กระบี่", "Chiang Mai"]);
	setLocale("en");
	expect(purchasePlaces([])).toEqual([]);
});
