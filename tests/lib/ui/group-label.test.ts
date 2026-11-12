import { expect, test } from "vitest"

import { CARDS_GROUPS } from "#lib/domain/cards-view"
import { LISTS_GROUPS, TX_GROUPS } from "#lib/domain/transactions"
import { en } from "#lib/i18n/en"
import { setLocale } from "#lib/i18n/index"
import { th } from "#lib/i18n/th"
import { groupingLabel } from "#lib/ui/group-label"

test("every grouping has a name in both languages", () => {
	const all = new Set([...CARDS_GROUPS, ...TX_GROUPS, ...LISTS_GROUPS])
	for (const catalog of [en, th] as Record<string, string>[]) {
		for (const by of all) expect(catalog[`group.${by}`], by).toBeTruthy()
	}
})

test("the names follow the language", () => {
	setLocale("en")
	expect(groupingLabel("place")).toBe("Place")
	expect(groupingLabel("none")).toBe("None")
	setLocale("th")
	expect(groupingLabel("day")).toBe("วัน")
	setLocale("en")
})
