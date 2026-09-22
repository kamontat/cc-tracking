import type { Location } from "#lib/domain/location";
import type { Card } from "#lib/domain/types";

/** Where a card is assumed to be usable for purchases when nothing says otherwise. */
export const PURCHASE_LOCATION: Location = "krabi";

/**
 * Whether a new purchase may be entered against this card.
 *
 * The answer is per card, set on the card form. A card written before the flag existed has no
 * answer stored, and falls back to where it is kept: only the Krabi cards were ever used for
 * new purchases, so that reproduces the rule that was in force before without rewriting a
 * single stored card.
 */
export function canPurchase(card: Card): boolean {
	return card.canPurchase ?? card.location === PURCHASE_LOCATION;
}
