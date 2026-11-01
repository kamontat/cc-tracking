/**
 * The address of the purchase page: `/purchase` alone shows the card picker, and
 * `/purchase?card=<id>` opens the purchase sheet over it. The + New menu's *Add purchase*
 * links here.
 */
export function purchaseAddress(cardId?: string): string {
	return cardId
		? `/purchase?${new URLSearchParams({ card: cardId })}`
		: "/purchase";
}

/** The card a purchase page address names, if any. */
export function readPurchaseAddress(search: string): string | undefined {
	return new URLSearchParams(search).get("card") || undefined;
}

/**
 * The card page a saved purchase lands on, with `&over=<satang>` when it went over the room,
 * so that page can say by how much (FR-19).
 */
export function savedPurchaseAddress(cardId: string, over: number): string {
	const params = new URLSearchParams({ id: cardId });
	if (over > 0) params.set("over", String(over));
	return `/card?${params}`;
}
