import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { addPeriods, compareDates } from "#lib/domain/date";
import { sumAmounts } from "#lib/domain/money";
import { partsOf } from "#lib/domain/payment";
import type {
	Card,
	Period,
	PlainDate,
	Purchase,
	Statement,
	StatementPayment,
} from "#lib/domain/types";

export function buildStatement(
	card: Card,
	period: Period,
	purchases: Purchase[],
	payment: StatementPayment | null = null,
): Statement {
	const mine = purchases
		.filter(
			(p) =>
				p.cardId === card.id && periodOfPurchase(card.cycle, p.date) === period,
		)
		.sort((a, b) => compareDates(a.date, b.date) || (a.id < b.id ? -1 : 1));

	const total = sumAmounts(mine.map((p) => p.amount));
	const paidAmount = sumAmounts(
		partsOf(payment, total).map((part) => part.amount),
	);
	const remaining = Math.max(0, total - paidAmount);
	return {
		cardId: card.id,
		period,
		closeDate: payment?.closeDate ?? closeDateOf(card.cycle, period),
		dueDate: payment?.dueDate ?? dueDateOf(card.cycle, period),
		purchases: mine,
		total,
		paidAmount,
		remaining,
		paid: payment !== null && remaining === 0,
		payment,
	};
}

/** The period currently accepting purchases. */
export function openPeriod(card: Card, today: PlainDate): Period {
	return periodOfPurchase(card.cycle, today);
}

/** `count` periods, newest first, starting at the open period. */
export function recentPeriods(
	card: Card,
	today: PlainDate,
	count: number,
): Period[] {
	const start = openPeriod(card, today);
	return Array.from({ length: count }, (_, index) => addPeriods(start, -index));
}
