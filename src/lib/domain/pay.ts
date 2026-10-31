import { addDays, compareDates, daysBetween } from "#lib/domain/date";
import { ledgerUrgency, nextBill } from "#lib/domain/ledger";
import type {
	Card,
	CardLedger,
	CardPayment,
	LedgerStatement,
	PlainDate,
} from "#lib/domain/types";

export type PayChoice = {
	card: Card;
	owed: number;
	credit: number;
	bill: LedgerStatement | null;
	urgency: "overdue" | "soon" | "due" | "none";
	/** Days overdue for overdue, days left otherwise, 0 for none. */
	days: number;
};

const byId = (a: { id: string }, b: { id: string }): number =>
	a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const RANK = { overdue: 0, soon: 1, due: 2, none: 2 } as const;

/**
 * The cards a payment can go to: unarchived ones, plus archived ones while they owe.
 * Overdue first (most days), then due soon, then most owed, ties by id.
 */
export function payChoices(
	cards: Card[],
	ledgers: Map<string, CardLedger>,
	today: PlainDate,
): PayChoice[] {
	const choices: PayChoice[] = [];
	for (const card of cards) {
		const ledger = ledgers.get(card.id);
		const owed = ledger?.owed ?? 0;
		if (card.archived && owed <= 0) continue;
		const bill = ledger ? nextBill(ledger, today) : null;
		let urgency: PayChoice["urgency"] = "none";
		let days = 0;
		if (bill) {
			const u = ledgerUrgency(bill, today);
			if (u === "overdue") {
				urgency = u;
				days = daysBetween(bill.dueDate, today);
			} else if (u === "soon" || u === "due") {
				urgency = u;
				days = daysBetween(today, bill.dueDate);
			}
		}
		choices.push({
			card,
			owed,
			credit: ledger?.credit ?? 0,
			bill,
			urgency,
			days,
		});
	}
	return choices.sort(
		(a, b) =>
			RANK[a.urgency] - RANK[b.urgency] ||
			(a.urgency === "overdue" ? b.days - a.days : 0) ||
			(a.urgency === "soon" ? a.days - b.days : 0) ||
			b.owed - a.owed ||
			byId(a.card, b.card),
	);
}

/** Id, name or last four digits, ignoring case. A blank query matches every card. */
export function matchesCard(card: Card, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (q === "") return true;
	return [card.id, card.name, card.last4].some((v) =>
		v.toLowerCase().includes(q),
	);
}

export function payFigures(
	ledger: CardLedger,
	today: PlainDate,
): { owed: number; credit: number; nextBill: number; overdue: boolean } {
	const bill = nextBill(ledger, today);
	return {
		owed: ledger.owed,
		credit: ledger.credit,
		nextBill: bill?.remaining ?? 0,
		overdue: bill !== null && ledgerUrgency(bill, today) === "overdue",
	};
}

/** A payment dated after today is a plan; a paid one beyond what is owed becomes credit. */
export function payPreview(
	amount: number,
	date: PlainDate,
	owed: number,
	today: PlainDate,
): { plan: boolean; extra: number } {
	const plan = compareDates(date, today) > 0;
	return { plan, extra: plan ? 0 : Math.max(0, amount - owed) };
}

/** Paid on the plan's date when that is today or earlier, else today (paid early). */
export function markPaid(payment: CardPayment, today: PlainDate): CardPayment {
	const date = compareDates(payment.date, today) <= 0 ? payment.date : today;
	return { ...payment, status: "paid", date };
}

export function plannedOf(payments: CardPayment[]): CardPayment[] {
	return payments
		.filter((p) => p.status === "planned")
		.sort((a, b) => compareDates(a.date, b.date) || byId(a, b));
}

/** Planned payments dated on or before `limit`, in plan order. */
export function plannedUntil(
	payments: CardPayment[],
	limit: PlainDate,
): CardPayment[] {
	return plannedOf(payments).filter((p) => compareDates(p.date, limit) <= 0);
}

export const NEEDS_PLANNED_DAYS = 3;
export const plannedHorizon = (today: PlainDate): PlainDate =>
	addDays(today, NEEDS_PLANNED_DAYS);
