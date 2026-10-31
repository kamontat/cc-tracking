import type { PaymentPart, StatementPayment } from "#lib/domain/types";

/**
 * Every payment toward a statement. A record saved before partial payments existed has no
 * parts and paid the whole of `total` on its `paidAt`, so it reads as one part for that much.
 */
export function partsOf(
	payment: StatementPayment | null,
	total: number,
): PaymentPart[] {
	if (!payment) return [];
	return payment.parts ?? [{ paidAt: payment.paidAt, amount: total }];
}
