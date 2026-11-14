import type { OwedEntry } from "#lib/domain/owed-plan"
import type { Card } from "#lib/domain/types"

import { afterEach, describe, expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { entryNote, owedGlance, rangeWords, sectionName } from "#lib/ui/owed-words"

afterEach(() => setLocale("en"))

const TODAY = "2026-10-31"
const card = { id: "7", name: "SCB", last4: "1029" } as Card
const entry = (extra: Partial<OwedEntry>): OwedEntry => ({
	card,
	kind: "bill",
	amount: 100,
	date: "2026-11-14",
	due: "2026-11-14",
	statement: null,
	...extra,
})

test("a range reads as the next N days, or everything owed", () => {
	expect(rangeWords(30)).toBe("Next 30 days")
	expect(rangeWords("all")).toBe("Everything owed")
})

describe("entryNote", () => {
	test("a bill's due date, a plan's bill, an open statement", () => {
		expect(entryNote(entry({}), TODAY)).toBe("Bill due 14 Nov")
		expect(entryNote(entry({ kind: "plan", date: "2026-11-05" }), TODAY)).toBe("Planned · bill due 14 Nov")
		expect(entryNote(entry({ kind: "plan", due: null }), TODAY)).toBe("Planned")
		expect(entryNote(entry({ kind: "open" }), TODAY)).toBe("Still open · spent so far")
	})

	test("how late, once its day has passed", () => {
		expect(entryNote(entry({ date: "2026-10-30" }), TODAY)).toBe("1 day late")
		expect(entryNote(entry({ date: "2026-10-15" }), TODAY)).toBe("16 days late")
		setLocale("th")
		expect(entryNote(entry({ date: "2026-10-15" }), TODAY)).toBe("เลยกำหนด 16 วัน")
	})
})

describe("sectionName", () => {
	const section = (start: string) => ({ start, end: start, days: [], firm: 0, estimate: 0 })

	test("this week, next week, then the week's Monday", () => {
		expect(sectionName(section("2026-10-26"), "week", TODAY)).toBe("This week")
		expect(sectionName(section("2026-11-02"), "week", TODAY)).toBe("Next week")
		expect(sectionName(section("2026-11-09"), "week", TODAY)).toBe("Week of 9 Nov")
	})

	test("a month in full, with its year", () => {
		expect(sectionName(section("2026-11-01"), "month", TODAY)).toBe("November 2026")
	})
})

describe("owedGlance", () => {
	const day = (date: string, firm: number) => ({ date, entries: [], firm, estimate: 0, byThen: firm })
	const totals = {
		total: 580_000,
		estimate: 40_000,
		payingDays: 2,
		next: day("2026-11-05", 200_000),
		week: 200_000,
		biggest: day("2026-11-14", 380_000),
	}

	test("the range and its dates, then what to pay, the next day, the next 7 days and the biggest day", () => {
		const glance = owedGlance(totals, 30, 0, TODAY, null)
		expect(glance.title).toBe("Next 30 days")
		expect(glance.aside).toBe("31 Oct – 30 Nov 2026")
		expect(glance.figures.map((f) => [f.field, f.label, f.text, f.note])).toEqual([
			["total", "To pay", "฿5,800.00", "2 paying days · ~฿400.00 more still open"],
			["next", "Next", "฿2,000.00", "5 Nov · in 5 days"],
			["week", "Next 7 days", "฿2,000.00", "to 7 Nov"],
			["biggest", "Biggest day", "฿3,800.00", "14 Nov · in 14 days"],
		])
		expect(owedGlance(totals, "all", 0, TODAY, null).aside).toBeUndefined()
	})

	test("late money is one more figure, red, that opens its panel", () => {
		let opened = 0
		const late = owedGlance(totals, 30, 100_000, TODAY, () => opened++, true).figures.at(-1)
		expect(late).toMatchObject({ field: "late", label: "Late", text: "฿1,000.00", tone: "out", note: "needed now" })
		expect(late?.open?.current).toBe(true)
		late?.open?.run()
		expect(opened).toBe(1)
	})

	test("nothing due reads as a dash", () => {
		const none = owedGlance({ ...totals, next: null, biggest: null }, 30, 0, TODAY, null).figures
		expect(none.find((f) => f.field === "next")).toMatchObject({ text: "—", note: "Nothing due" })
	})
})
