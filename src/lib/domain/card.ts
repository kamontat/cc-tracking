import type { Card, LocationRecord } from "#lib/domain/types"

import { takesPurchases } from "#lib/domain/locations"

/**
 * Whether a new purchase may be entered against this card.
 *
 * The answer belongs to where the card is kept, not to the card: a place either takes new
 * spending or it does not, and every card sitting there follows. A place with no stored
 * record takes none. It was a per-card flag once, and stored cards still carry that key — it
 * is deliberately ignored, so moving a card between locations cannot leave a stale answer
 * behind it.
 */
export function canPurchase(card: Card, locations: LocationRecord[]): boolean {
	return takesPurchases(locations, card.location)
}

/**
 * A card id's form (RD-28): digits in dot-separated parts, after at most one lower-case letter
 * (`5`, `12.3`, `k1.2`; never `5.`, `.5`, `1..2` or `K1`). The card form and restore check it.
 */
export const isCardId = (id: string): boolean => /^[a-z]?[0-9]+(\.[0-9]+)*$/.test(id)
