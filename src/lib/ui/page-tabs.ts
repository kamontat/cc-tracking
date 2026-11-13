import type { MessageKey } from "#lib/i18n/catalog"

import { LIMITS_ADDRESS } from "#lib/ui/cards-query"
import { NEEDS_ADDRESS, OWED_ADDRESS, READY_ADDRESS } from "#lib/ui/home-query"
import { LEDGER_ADDRESS, LISTS_ADDRESS } from "#lib/ui/tx-query"

/** One of a page's tabs (`PageTabs`): its own address and its label. */
export type PageTab = { href: string; label: MessageKey }

/** Cards' tabs (RD-22): the cards, and their limits. */
export const CARDS_TABS: readonly PageTab[] = [
	{ href: "/cards", label: "cards.tab.cards" },
	{ href: LIMITS_ADDRESS, label: "cards.tab.limits" },
]

/** Transactions' tabs (RD-22): what happened, and the purchase lists. */
export const TRANSACTIONS_TABS: readonly PageTab[] = [
	{ href: LEDGER_ADDRESS, label: "tx.tab.ledger" },
	{ href: LISTS_ADDRESS, label: "tx.tab.lists" },
]

/** Home's tabs (RD-22): what needs you, what to pay, where to spend. */
export const HOME_TABS: readonly PageTab[] = [
	{ href: NEEDS_ADDRESS, label: "home.tab.needs" },
	{ href: OWED_ADDRESS, label: "home.tab.owed" },
	{ href: READY_ADDRESS, label: "home.tab.ready" },
]
