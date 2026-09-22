import { expect, test } from "bun:test";
import { describeCycleText } from "#lib/i18n/format";
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
	).toBe("ปิดยอดวันที่ 18 ครบกำหนดอีก 15 วัน");
	expect(describeCycleText({ kind: "fixed", closeDay: 18, dueDay: 5 })).toBe(
		"ปิดยอดวันที่ 18 ครบกำหนดวันที่ 5",
	);
});
