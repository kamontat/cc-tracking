import { afterEach, expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { cardsSortLabel } from "#lib/ui/cards-sort"

afterEach(() => setLocale("en"))

test("each sort has its words", () => {
	expect(cardsSortLabel("place")).toBe("By place")
	expect(cardsSortLabel("room")).toBe("Most room")
	expect(cardsSortLabel("name")).toBe("Name")
	expect(cardsSortLabel("close")).toBe("Soonest to close")
	expect(cardsSortLabel("due")).toBe("Soonest due")
	setLocale("th")
	expect(cardsSortLabel("room")).not.toBe("Most room")
})
