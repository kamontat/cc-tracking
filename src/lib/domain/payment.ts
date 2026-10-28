import { compareDates } from "#lib/domain/date";
import type {
	PaymentPart,
	PlainDate,
	Statement,
	StatementPayment,
} from "#lib/domain/types";

/** What a payment needs from the statement it pays toward. */
type StatementRef = Pick<
	Statement,
	"cardId" | "period" | "closeDate" | "dueDate"
>;

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

const latest = (parts: PaymentPart[], fallback: PlainDate): PlainDate =>
	parts.at(-1)?.paidAt ?? fallback;

/**
 * `payment` with one more part, or a new record when there is none yet. A new record freezes
 * the statement's dates; an existing one keeps the dates it froze.
 */
export function addPart(
	payment: StatementPayment | null,
	statement: StatementRef & { total: number },
	part: PaymentPart,
): StatementPayment {
	const parts = [...partsOf(payment, statement.total), part].sort((a, b) =>
		compareDates(a.paidAt, b.paidAt),
	);
	return {
		cardId: statement.cardId,
		period: statement.period,
		closeDate: payment?.closeDate ?? statement.closeDate,
		dueDate: payment?.dueDate ?? statement.dueDate,
		paidAt: latest(parts, part.paidAt),
		parts,
	};
}

/** `payment` without the part at `index`, or null when no part is left. */
export function removePart(
	payment: StatementPayment,
	index: number,
	total: number,
): StatementPayment | null {
	const parts = partsOf(payment, total).filter((_, at) => at !== index);
	if (parts.length === 0) return null;
	return { ...payment, paidAt: latest(parts, payment.paidAt), parts };
}
