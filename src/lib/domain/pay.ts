import type { Card, CardLedger, CardPayment, PlainDate } from "#lib/domain/types"

import { addDays, compareDates } from "#lib/domain/date"
import { ledgerUrgency, nextBill } from "#lib/domain/ledger"

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Id, name or last four digits, ignoring case. A blank query matches every card. */
export function matchesCard(card: Card, query: string): boolean {
	const q = query.trim().toLowerCase()
	if (q === "") return true
	return [card.id, card.name, card.last4].some((v) => v.toLowerCase().includes(q))
}

export function payFigures(
	ledger: CardLedger,
	today: PlainDate,
): { owed: number; credit: number; nextBill: number; overdue: boolean } {
	const bill = nextBill(ledger, today)
	return {
		owed: ledger.owed,
		credit: ledger.credit,
		nextBill: bill?.remaining ?? 0,
		overdue: bill !== null && ledgerUrgency(bill, today) === "overdue",
	}
}

/** A payment dated after today is a plan; a paid one beyond what is owed becomes credit. */
export function payPreview(
	amount: number,
	date: PlainDate,
	owed: number,
	today: PlainDate,
): { plan: boolean; extra: number } {
	const plan = compareDates(date, today) > 0
	return { plan, extra: plan ? 0 : Math.max(0, amount - owed) }
}

/** Paid on the plan's date when that is today or earlier, else today (paid early). */
export function markPaid(payment: CardPayment, today: PlainDate): CardPayment {
	const date = compareDates(payment.date, today) <= 0 ? payment.date : today
	return { ...payment, status: "paid", date }
}

export function plannedOf(payments: CardPayment[]): CardPayment[] {
	return payments.filter((p) => p.status === "planned").sort((a, b) => compareDates(a.date, b.date) || byId(a, b))
}

/** How many days ahead a planned payment shows in Needs you. */
export const NEEDS_PLANNED_DAYS = 3
export const plannedHorizon = (today: PlainDate): PlainDate => addDays(today, NEEDS_PLANNED_DAYS)
