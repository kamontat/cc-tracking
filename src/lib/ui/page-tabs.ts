import type { MessageKey } from "#lib/i18n/catalog"

import { LIMITS_ADDRESS } from "#lib/ui/cards-query"

/** One of a page's tabs (`PageTabs`): its own address and its label. */
export type PageTab = { href: string; label: MessageKey }

/** Cards' tabs (RD-22): the cards, and their limits. */
export const CARDS_TABS: readonly PageTab[] = [
	{ href: "/cards", label: "cards.tab.cards" },
	{ href: LIMITS_ADDRESS, label: "cards.tab.limits" },
]
