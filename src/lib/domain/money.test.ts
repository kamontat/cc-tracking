import { describe, expect, test } from "bun:test";
import { formatAmount, parseAmount, sumAmounts } from "#lib/domain/money.ts";

describe("parseAmount", () => {
	test("reads whole baht", () => {
		expect(parseAmount("1200")).toBe(120_000);
	});

	test("reads satang", () => {
		expect(parseAmount("1234.56")).toBe(123_456);
	});

	test("pads a single decimal digit", () => {
		expect(parseAmount("10.5")).toBe(1050);
	});

	test("ignores thousands separators and surrounding space", () => {
		expect(parseAmount(" 1,234.56 ")).toBe(123_456);
	});

	test("rejects empty, negative, non-numeric, and over-precise input", () => {
		expect(() => parseAmount("")).toThrow(RangeError);
		expect(() => parseAmount("-5")).toThrow(RangeError);
		expect(() => parseAmount("abc")).toThrow(RangeError);
		expect(() => parseAmount("1.234")).toThrow(RangeError);
	});

	test("rejects zero, because a zero purchase is a mistake", () => {
		expect(() => parseAmount("0")).toThrow(RangeError);
	});
});

describe("formatAmount", () => {
	test("groups thousands and always shows satang", () => {
		expect(formatAmount(123_456)).toBe("฿1,234.56");
		expect(formatAmount(120_000)).toBe("฿1,200.00");
		expect(formatAmount(50)).toBe("฿0.50");
	});
});

describe("sumAmounts", () => {
	test("adds integers exactly", () => {
		expect(sumAmounts([123_456, 1050, 50])).toBe(124_556);
	});

	test("is zero for nothing", () => {
		expect(sumAmounts([])).toBe(0);
	});
});
