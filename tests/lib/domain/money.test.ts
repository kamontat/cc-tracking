import { describe, expect, test } from "vitest"

import { amountOf, formatAmount, formatAmountInput, formatCompact, parseAmount, sumAmounts } from "#lib/domain/money"

describe("parseAmount", () => {
	test("reads whole baht", () => {
		expect(parseAmount("1200")).toBe(120_000)
	})

	test("reads satang", () => {
		expect(parseAmount("1234.56")).toBe(123_456)
	})

	test("pads a single decimal digit", () => {
		expect(parseAmount("10.5")).toBe(1050)
	})

	test("ignores thousands separators and surrounding space", () => {
		expect(parseAmount(" 1,234.56 ")).toBe(123_456)
	})

	test("rejects empty, negative, non-numeric, and over-precise input", () => {
		expect(() => parseAmount("")).toThrow(RangeError)
		expect(() => parseAmount("-5")).toThrow(RangeError)
		expect(() => parseAmount("abc")).toThrow(RangeError)
		expect(() => parseAmount("1.234")).toThrow(RangeError)
	})

	test("rejects zero, because a zero purchase is a mistake", () => {
		expect(() => parseAmount("0")).toThrow(RangeError)
	})
})

describe("formatAmount", () => {
	test("groups thousands and always shows satang", () => {
		expect(formatAmount(123_456)).toBe("฿1,234.56")
		expect(formatAmount(120_000)).toBe("฿1,200.00")
		expect(formatAmount(50)).toBe("฿0.50")
	})

	test("a negative amount reads with the minus sign, not a hyphen", () => {
		expect(formatAmount(-2_106_500)).toBe("−฿21,065.00")
		expect(formatAmount(-50)).toBe("−฿0.50")
	})
})

describe("formatAmountInput", () => {
	test("drops the decimal for a whole baht amount", () => {
		expect(formatAmountInput(500_000)).toBe("5000")
	})

	test("keeps two digits of satang when there is a fraction", () => {
		expect(formatAmountInput(123_456)).toBe("1234.56")
	})

	test("has no currency symbol or thousands separator", () => {
		const text = formatAmountInput(1_000_000)
		expect(text).not.toContain("฿")
		expect(text).not.toContain(",")
	})

	test("round-trips through parseAmount", () => {
		expect(parseAmount(formatAmountInput(123_456))).toBe(123_456)
		expect(parseAmount(formatAmountInput(500_000))).toBe(500_000)
	})
})

describe("sumAmounts", () => {
	test("adds integers exactly", () => {
		expect(sumAmounts([123_456, 1050, 50])).toBe(124_556)
	})

	test("is zero for nothing", () => {
		expect(sumAmounts([])).toBe(0)
	})
})

describe("amountOf", () => {
	test("reads an amount, or null instead of throwing", () => {
		expect(amountOf("1,200.50")).toBe(120_050)
		expect(amountOf("")).toBeNull()
		expect(amountOf("abc")).toBeNull()
		expect(amountOf("0")).toBeNull()
	})
})

test("formatCompact shortens baht for a chart label, the same in every language", () => {
	expect(formatCompact(0)).toBe("0")
	expect(formatCompact(999_00)).toBe("999")
	expect(formatCompact(12_500_00)).toBe("12.5K")
	expect(formatCompact(105_040_00)).toBe("105K")
	expect(formatCompact(1_060_000_00)).toBe("1.1M")
})
