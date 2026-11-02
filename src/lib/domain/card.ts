import { takesPurchases } from "#lib/domain/locations";
import type { Card, LocationRecord } from "#lib/domain/types";

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
	return takesPurchases(locations, card.location);
}
