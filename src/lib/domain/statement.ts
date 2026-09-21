import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle.ts";
import {
	addPeriods,
	compareDates,
	comparePeriods,
	daysBetween,
} from "#lib/domain/date.ts";
import { sumAmounts } from "#lib/domain/money.ts";
import type {
	Card,
	Period,
	PlainDate,
	Purchase,
	Statement,
	StatementPayment,
} from "#lib/domain/types.ts";

export type Urgency = "overdue" | "soon" | "open" | "future";

const DUE_SOON_DAYS = 7;

export function buildStatement(
	card: Card,
	period: Period,
	purchases: Purchase[],
	payment: StatementPayment | null = null,
): Statement {
	const mine = purchases
		.filter((p) => p.cardId === card.id && periodOfPurchase(card.cycle, p.date) === period)
		.sort((a, b) => compareDates(a.date, b.date) || (a.id < b.id ? -1 : 1));

	return {
		cardId: card.id,
		period,
		closeDate: payment?.closeDate ?? closeDateOf(card.cycle, period),
		dueDate: payment?.dueDate ?? dueDateOf(card.cycle, period),
		purchases: mine,
		total: sumAmounts(mine.map((p) => p.amount)),
		paid: payment !== null,
		payment,
	};
}

/** The period currently accepting purchases. */
export function openPeriod(card: Card, today: PlainDate): Period {
	return periodOfPurchase(card.cycle, today);
}

/** `count` periods, newest first, starting at the open period. */
export function recentPeriods(card: Card, today: PlainDate, count: number): Period[] {
	const start = openPeriod(card, today);
	return Array.from({ length: count }, (_, index) => addPeriods(start, -index));
}

/**
 * The statement needing attention: the oldest closed statement that is still unpaid,
 * or the open period when every closed statement is settled.
 */
export function nextActionable(
	card: Card,
	purchases: Purchase[],
	payments: StatementPayment[],
	today: PlainDate,
): Statement {
	const paymentFor = (period: Period): StatementPayment | null =>
		payments.find((p) => p.cardId === card.id && p.period === period) ?? null;

	const open = openPeriod(card, today);
	const earliest = purchases
		.filter((p) => p.cardId === card.id)
		.map((p) => periodOfPurchase(card.cycle, p.date))
		.sort(comparePeriods)[0];

	// Walk from the earliest period that could owe money up to the open one.
	let period = earliest && comparePeriods(earliest, open) < 0 ? earliest : open;
	while (comparePeriods(period, open) < 0) {
		const statement = buildStatement(card, period, purchases, paymentFor(period));
		if (!statement.paid && statement.total > 0) return statement;
		period = addPeriods(period, 1);
	}
	return buildStatement(card, open, purchases, paymentFor(open));
}

export function urgencyOf(statement: Statement, today: PlainDate): Urgency {
	if (compareDates(today, statement.closeDate) <= 0) return "future";
	if (statement.paid) return "open";
	const remaining = daysBetween(today, statement.dueDate);
	if (remaining < 0) return "overdue";
	return remaining <= DUE_SOON_DAYS ? "soon" : "open";
}
