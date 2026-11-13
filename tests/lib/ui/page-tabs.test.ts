import { expect, test } from "vitest"

import { LIMITS_ADDRESS } from "#lib/ui/cards-query"
import { CARDS_TABS } from "#lib/ui/page-tabs"

test("Cards has two tabs, Cards and Limits, each its own address", () => {
	expect(CARDS_TABS).toEqual([
		{ href: "/cards", label: "cards.tab.cards" },
		{ href: "/cards/limits", label: "cards.tab.limits" },
	])
	expect(CARDS_TABS[1]?.href).toBe(LIMITS_ADDRESS)
})
