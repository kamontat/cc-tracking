import { expect, test } from "vitest"

import { figureParts, payDetail, readyAmount } from "#lib/ui/pay-form"

test("a figure splits only after the baht sign or a comma", () => {
	expect(figureParts(143_903_96)).toEqual(["฿", "143,", "903.96"])
	expect(figureParts(300_00)).toEqual(["฿", "300.00"])
})

test("an amount is ready only above zero on a real date", () => {
	expect(readyAmount("120.5", "2026-10-31")).toBe(120_50)
	expect(readyAmount("0", "2026-10-31")).toBeNull()
	expect(readyAmount("abc", "2026-10-31")).toBeNull()
	expect(readyAmount("100", "2026-02-31")).toBeNull()
	expect(readyAmount("100", "")).toBeNull()
})

test("the detail carries the note only when it is not blank, trimmed", () => {
	expect(payDetail(100, "2026-10-31", "  ")).toEqual({ amount: 100, date: "2026-10-31" })
	expect(payDetail(100, "2026-10-31", " savings ")).toEqual({ amount: 100, date: "2026-10-31", note: "savings" })
})
