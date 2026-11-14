import { afterEach, expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { cardsGlanceFigures, rangeText } from "#lib/ui/glance"

afterEach(() => setLocale("en"))

test("Cards' four figures: count, owed, due in 7 days (warn when any) with its cards, and the used share as a bar", () => {
	const figures = cardsGlanceFigures({ count: 4, owed: 123_456_78, soon: { count: 1, amount: 2_000_00 }, usedPct: 83 })
	expect(figures).toEqual([
		{ field: "count", label: "Cards", text: "4" },
		{ field: "owed", label: "Owed", text: "฿123,456.78" },
		{ field: "soon", label: "Due in 7 days", text: "฿2,000.00", tone: "warn", note: "1 card" },
		{
			field: "used",
			label: "Used of limit",
			text: "83%",
			bar: { share: 83, level: "high", label: "83% of the limit used" },
		},
	])
})

test("nothing due has no tone; past the limit is over; no group is a dash with no bar; Thai labels", () => {
	setLocale("th")
	const [, , soon, used] = cardsGlanceFigures({ count: 0, owed: 0, soon: { count: 0, amount: 0 }, usedPct: null })
	expect(soon?.tone).toBeUndefined()
	expect(soon?.label).toBe("ครบกำหนดใน 7 วัน")
	expect(used).toEqual({ field: "used", label: "ใช้ไปของวงเงิน", text: "—" })
	setLocale("en")
	expect(cardsGlanceFigures({ count: 1, owed: 0, soon: { count: 0, amount: 0 }, usedPct: 101 })[3]?.bar?.level).toBe(
		"over",
	)
	expect(cardsGlanceFigures({ count: 1, owed: 0, soon: { count: 0, amount: 0 }, usedPct: 79 })[3]?.bar?.level).toBe(
		"within",
	)
})

test("a range in words: one day alone, the year once within a year, both years across one", () => {
	expect(rangeText({ from: "2026-10-30", to: "2026-10-30" }, "en")).toBe("30 Oct 2026")
	expect(rangeText({ from: "2026-10-01", to: "2026-10-31" }, "en")).toBe("1 Oct – 31 Oct 2026")
	expect(rangeText({ from: "2025-12-20", to: "2026-01-05" }, "en")).toBe("20 Dec 2025 – 5 Jan 2026")
	expect(rangeText({ from: "2026-10-01", to: "2026-10-31" }, "th")).toMatch(/^1 .+ – 31 .+ 2026$/)
})
