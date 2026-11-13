import type { MessageKey } from "#lib/i18n/catalog"

import { LIMITS_ADDRESS } from "#lib/ui/cards-query"
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
