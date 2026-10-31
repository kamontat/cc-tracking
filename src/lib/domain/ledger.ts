import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { compareDates, comparePeriods, daysBetween } from "#lib/domain/date";
import { sumAmounts } from "#lib/domain/money";
import { openPeriod } from "#lib/domain/statement";
import type {
	Card,
	CardLedger,
	CardPayment,
	LedgerStatement,
	Period,
	PlainDate,
	Purchase,
	StatementDates,
} from "#lib/domain/types";

/**
 * Settle a card's statements from its paid money.
 *
 * Money is not tied to one statement: a payment with no `period` joins a pool that settles
 * the oldest statement first, the open period included. Only converted records carry a
 * `period`; they pay that statement first, and whatever they overshoot joins the pool.
 * Whatever the pool cannot spend is `credit`, so an exact payment leaves none.
 * Planned payments are ignored: they have not happened yet.
 */
export function cardLedger(
	card: Card,
	purchases: Purchase[],
	payments: CardPayment[],
	frozen: StatementDates[],
	today: PlainDate,
): CardLedger {
	const open = openPeriod(card, today);
	const mine = purchases.filter((p) => p.cardId === card.id);

	const periods = new Set<Period>([open]);
	for (const p of mine) periods.add(periodOfPurchase(card.cycle, p.date));
	const ascending = [...periods].sort(comparePeriods);

	const paidPayments = payments.filter(
		(p) => p.cardId === card.id && p.status === "paid",
	);

	const frozenFor = (period: Period): StatementDates | undefined =>
		frozen.find((f) => f.cardId === card.id && f.period === period);

	const rows = ascending.map((period) => {
		const own = mine
			.filter((p) => periodOfPurchase(card.cycle, p.date) === period)
			.sort((a, b) => compareDates(a.date, b.date) || (a.id < b.id ? -1 : 1));
		return {
			period,
			own,
			total: sumAmounts(own.map((p) => p.amount)),
			paid: 0,
		};
	});

	// Payments naming a period go to that statement first, capped at its total.
	let pool = 0;
	for (const payment of paidPayments) {
		const row = payment.period
			? rows.find((r) => r.period === payment.period)
			: undefined;
		if (!row) {
			pool += payment.amount;
			continue;
		}
		const applied = Math.min(payment.amount, row.total - row.paid);
		row.paid += applied;
		pool += payment.amount - applied;
	}

	// The pool settles statements oldest first.
	for (const row of rows) {
		const applied = Math.min(pool, row.total - row.paid);
		row.paid += applied;
		pool -= applied;
	}

	const statements: LedgerStatement[] = rows
		.map((row): LedgerStatement => {
			const dates = frozenFor(row.period);
			const remaining = row.total - row.paid;
			return {
				cardId: card.id,
				period: row.period,
				closeDate: dates?.closeDate ?? closeDateOf(card.cycle, row.period),
				dueDate: dates?.dueDate ?? dueDateOf(card.cycle, row.period),
				purchases: row.own,
				total: row.total,
				paidAmount: row.paid,
				remaining,
				paid: row.paid > 0 && remaining === 0,
				open: row.period === open,
			};
		})
		.reverse();

	return {
		statements,
		owed: sumAmounts(statements.map((s) => s.remaining)),
		credit: pool,
	};
}

/** A ledger for every card, archived included: they still weigh on a group's room. */
export function ledgersFor(
	cards: Card[],
	purchases: Purchase[],
	payments: CardPayment[],
	dates: StatementDates[],
	today: PlainDate,
): Map<string, CardLedger> {
	return new Map(
		cards.map((c) => [c.id, cardLedger(c, purchases, payments, dates, today)]),
	);
}

/**
 * Statements money has reached that have no kept dates yet. Saving these keeps a paid
 * statement's close and due dates steady if the card's cycle is edited later.
 */
export function newlyFrozen(
	card: Card,
	ledger: CardLedger,
	frozen: StatementDates[],
): StatementDates[] {
	return ledger.statements
		.filter(
			(s) =>
				s.paidAmount > 0 &&
				!frozen.some((f) => f.cardId === card.id && f.period === s.period),
		)
		.map((s) => ({
			cardId: card.id,
			period: s.period,
			closeDate: s.closeDate,
			dueDate: s.dueDate,
		}));
}

export type LedgerUrgency = "overdue" | "soon" | "due" | "open" | "paid";

const SOON_DAYS = 7;

/**
 * How pressing a statement is. The open period, and any statement not yet closed, is
 * `open`. A statement with nothing left to pay (including an empty one) is `paid`, so it is
 * never overdue.
 */
export function ledgerUrgency(
	statement: LedgerStatement,
	today: PlainDate,
): LedgerUrgency {
	if (statement.open || compareDates(statement.closeDate, today) >= 0)
		return "open";
	if (statement.remaining === 0) return "paid";
	const daysLeft = daysBetween(today, statement.dueDate);
	if (daysLeft < 0) return "overdue";
	return daysLeft <= SOON_DAYS ? "soon" : "due";
}

/**
 * The oldest closed statement that still owes money, or null. Closed means not the open
 * period and its close date already past: a later period that has not closed yet is not a
 * bill, whatever it holds.
 */
export function nextBill(
	ledger: CardLedger,
	today: PlainDate,
): LedgerStatement | null {
	for (let i = ledger.statements.length - 1; i >= 0; i--) {
		const s = ledger.statements[i];
		if (s && !s.open && compareDates(s.closeDate, today) < 0 && s.remaining > 0)
			return s;
	}
	return null;
}
