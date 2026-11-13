import { expect, test } from "vitest"

import { LIMITS_ADDRESS } from "#lib/ui/cards-query"
import { NEEDS_ADDRESS, OWED_ADDRESS, READY_ADDRESS } from "#lib/ui/home-query"
import { CARDS_TABS, HOME_TABS, TRANSACTIONS_TABS } from "#lib/ui/page-tabs"
import { LEDGER_ADDRESS, LISTS_ADDRESS } from "#lib/ui/tx-query"

test("Cards has two tabs, Cards and Limits, each its own address", () => {
	expect(CARDS_TABS).toEqual([
		{ href: "/cards", label: "cards.tab.cards" },
		{ href: "/cards/limits", label: "cards.tab.limits" },
	])
	expect(CARDS_TABS[1]?.href).toBe(LIMITS_ADDRESS)
})

test("Transactions has two tabs, Ledger and Lists, each its own address", () => {
	expect(TRANSACTIONS_TABS).toEqual([
		{ href: "/transactions", label: "tx.tab.ledger" },
		{ href: "/transactions/lists", label: "tx.tab.lists" },
	])
	expect(TRANSACTIONS_TABS.map((tab) => tab.href)).toEqual([LEDGER_ADDRESS, LISTS_ADDRESS])
})

test("Home has three tabs, Needs you, Owed and Ready to use, each its own top-level address", () => {
	expect(HOME_TABS).toEqual([
		{ href: "/", label: "home.tab.needs" },
		{ href: "/owed", label: "home.tab.owed" },
		{ href: "/ready", label: "home.tab.ready" },
	])
	expect(HOME_TABS.map((tab) => tab.href)).toEqual([NEEDS_ADDRESS, OWED_ADDRESS, READY_ADDRESS])
})
