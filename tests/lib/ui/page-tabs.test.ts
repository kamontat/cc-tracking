import { expect, test } from "vitest"

import { LIMITS_ADDRESS } from "#lib/ui/cards-query"
import { CARDS_TABS, TRANSACTIONS_TABS } from "#lib/ui/page-tabs"
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
