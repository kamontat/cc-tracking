import type { OwedEntry } from "#lib/domain/owed-plan"
import type { Card } from "#lib/domain/types"

import { afterEach, describe, expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { entryNote, rangeWords, sectionName } from "#lib/ui/owed-words"

afterEach(() => setLocale("en"))

const TODAY = "2026-10-31"
const card = { id: "7", name: "SCB", last4: "1029" } as Card
const entry = (extra: Partial<OwedEntry>): OwedEntry => ({
	card,
	kind: "bill",
	amount: 100,
	date: "2026-11-14",
	due: "2026-11-14",
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
