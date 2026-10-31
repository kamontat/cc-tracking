/**
 * What the payment page opens on: a card opens its sheet over the picker, and `amount`
 * (satang) prefills that sheet; without one the sheet starts at the card's next bill.
 */
export type PayRequest = { cardId?: string; amount?: number };

/**
 * The address of the payment page: `/pay` alone shows the card picker, `/pay?card=<id>` opens
 * the payment sheet over it, and `&amount=<satang>` prefills the sheet's amount. Every way to
 * pay links here -- the + New menu's *Make a payment*, Home's overdue item, a Transactions *Owed*
 * row, the card page's *Make a payment*.
 */
export function payAddress(request: PayRequest = {}): string {
	const params = new URLSearchParams();
	if (request.cardId) params.set("card", request.cardId);
	if (request.cardId && request.amount !== undefined && request.amount > 0)
		params.set("amount", String(request.amount));
	const query = params.toString();
	return query ? `/pay?${query}` : "/pay";
}

/**
 * Reads a payment page address's query back: the card, and the amount when it is a whole,
 * positive number of satang (anything else is dropped, so the sheet falls back to the bill).
 */
export function readPayAddress(search: string): PayRequest {
	const params = new URLSearchParams(search);
	const cardId = params.get("card");
	if (!cardId) return {};
	const amount = params.get("amount");
	return amount && /^\d+$/.test(amount) && Number(amount) > 0
		? { cardId, amount: Number(amount) }
		: { cardId };
}
