import { expect, test } from "vitest"

import { CARDS_SORTS } from "#lib/domain/cards-view"
import { READY_SORTS } from "#lib/domain/home"
import { SORT_DIRS } from "#lib/domain/sort"
import { OWED_SORTS, TX_SORTS } from "#lib/domain/transactions"
import { en } from "#lib/i18n/en"
import { setLocale } from "#lib/i18n/index"
import { th } from "#lib/i18n/th"
import { sortFieldLabel, sortOrderLabel, sortShortLabel } from "#lib/ui/sort-label"

const FIELDS = [...new Set([...TX_SORTS, ...OWED_SORTS, ...CARDS_SORTS, ...READY_SORTS])]

test("every sort field has a name and words for each direction, in both languages", () => {
	for (const catalog of [en, th] as Record<string, string>[]) {
		for (const field of FIELDS) {
			expect(catalog[`sort.field.${field}`], field).toBeTruthy()
			for (const dir of SORT_DIRS) expect(catalog[`sort.order.${field}.${dir}`], `${field}.${dir}`).toBeTruthy()
		}
	}
})

test("the words say which way the list runs, and follow the language", () => {
	setLocale("en")
	expect(sortFieldLabel("date")).toBe("Date")
	expect(sortOrderLabel("date", "desc")).toBe("Newest first")
	expect(sortOrderLabel("date", "asc")).toBe("Oldest first")
	expect(sortOrderLabel("amount", "desc")).toBe("Biggest first")
	expect(sortOrderLabel("room", "desc")).toBe("Most room")
	expect(sortOrderLabel("close", "asc")).toBe("Soonest to close")
	expect(sortOrderLabel("close", "desc")).toBe("Longest to close")
	expect(sortOrderLabel("left", "desc")).toBe("Most owed")
	setLocale("th")
	expect(sortOrderLabel("date", "desc")).toBe("ใหม่สุดก่อน")
	setLocale("en")
})

test("each order has a short form for the switch, found inside its full words (label in name)", () => {
	for (const catalog of [en, th] as Record<string, string>[]) {
		for (const field of FIELDS) {
			for (const dir of SORT_DIRS) {
				const short = catalog[`sort.short.${field}.${dir}`]
				expect(short, `${field}.${dir}`).toBeTruthy()
				expect(catalog[`sort.order.${field}.${dir}`]?.toLowerCase()).toContain(short?.toLowerCase())
			}
		}
	}
	setLocale("en")
	expect(sortShortLabel("date", "desc")).toBe("Newest")
	expect(sortShortLabel("room", "asc")).toBe("Least")
})
