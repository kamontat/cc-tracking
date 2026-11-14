import type { Card, CardLedger, CardPayment, LimitGroup, Period, PlainDate } from "#lib/domain/types"

import { type CardFilter, filterCards } from "#lib/domain/cards-view"
import { addDays, compareDates, daysInMonth, formatDate, parseDate, periodOf } from "#lib/domain/date"
import { ledgerUrgency, statementStart } from "#lib/domain/ledger"
import { sumAmounts } from "#lib/domain/money"
import { plannedOf } from "#lib/domain/pay"

/**
 * Home's _Owed_ tab (RD-25): the money to have ready, day by day. A closed bill's amount left is
 * due on its due date; a planned payment counts on its own date and comes off the card's oldest
 * bill first (then the open statement), so no baht counts twice; an open statement is an
 * estimate on its due date, since it can still grow, and is never in a total.
 */
export type OwedKind = "bill" | "plan" | "open"

export const OWED_KINDS: readonly OwedKind[] = ["bill", "plan", "open"]

export type OwedEntry = {
	card: Card
	kind: OwedKind
	/** Satang. */
	amount: number
	/** The day the money is needed: the bill's due date, or the plan's date. */
	date: PlainDate
	/** The due date of the statement it pays (a plan's: the first statement it comes off); null for a plan with nothing owed. */
	due: PlainDate | null
	/** The statement it pays (a plan's: the first it comes off), for the billing cycle line; null for a plan with nothing owed. */
	statement: OwedStatement | null
	/** The planned payment, for a plan. */
	payment?: CardPayment
}

/** A statement's dates: the day it opened, the day it closes (or closed) and the day it is due. */
export type OwedStatement = { start: PlainDate; close: PlainDate; due: PlainDate }

const byId = (a: Card, b: Card): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Every amount each card needs paid, on its day, in no order (`owedPlan` sorts them). */
export function owedEntries(
	cards: Card[],
	ledgers: ReadonlyMap<string, CardLedger>,
	payments: CardPayment[],
	today: PlainDate,
): OwedEntry[] {
	const entries: OwedEntry[] = []
	for (const card of cards) {
		const ledger = ledgers.get(card.id)
		// Oldest first, as paid money settles them; the ledger keeps the newest first.
		const statements = [...(ledger?.statements ?? [])]
			.filter((s) => s.remaining > 0)
			.sort((a, b) => compareDates(a.dueDate, b.dueDate))
			.map((s) => ({
				dates: { start: statementStart(card, ledger?.statements ?? [], s.period), close: s.closeDate, due: s.dueDate },
				left: s.remaining,
				open: ledgerUrgency(s, today) === "open",
			}))
		for (const payment of plannedOf(payments.filter((p) => p.cardId === card.id))) {
			let rest = payment.amount
			const first = statements.find((s) => s.left > 0)
			for (const s of statements) {
				const part = Math.min(rest, s.left)
				s.left -= part
				rest -= part
			}
			entries.push({
				card,
				kind: "plan",
				amount: payment.amount,
				date: payment.date,
				due: first?.dates.due ?? null,
				statement: first?.dates ?? null,
				payment,
			})
		}
		for (const s of statements) {
			if (s.left <= 0) continue
			entries.push({
				card,
				kind: s.open ? "open" : "bill",
				amount: s.left,
				date: s.dates.due,
				due: s.dates.due,
				statement: s.dates,
			})
		}
	}
	return entries
}

/** How far ahead the tab looks, in days, or everything owed. */
export type OwedRange = 7 | 14 | 30 | 60 | "all"

export const OWED_RANGES: readonly OwedRange[] = [7, 14, 30, 60, "all"]

/** The calendar, or a list of days in week or month sections. */
export type OwedLayout = "calendar" | "week" | "month"

export const OWED_LAYOUTS: readonly OwedLayout[] = ["calendar", "week", "month"]

/** What the tab shows: Cards' search and filter, the range, which kinds, and the layout. */
export type OwedPlanView = CardFilter & { range: OwedRange; shows: OwedKind[]; layout: OwedLayout }

export const DEFAULT_OWED_PLAN: OwedPlanView = {
	q: "",
	locations: [],
	owners: [],
	range: 30,
	shows: [...OWED_KINDS],
	layout: "calendar",
}

/** One day's money: firm (bills and plans) and estimate (open statements), and the firm total from today to it. */
export type OwedDay = {
	date: PlainDate
	/** Firm first, then the biggest; ties by card id. */
	entries: OwedEntry[]
	firm: number
	estimate: number
	byThen: number
}

const firmOf = (entries: OwedEntry[]) => sumAmounts(entries.filter((e) => e.kind !== "open").map((e) => e.amount))
const estimateOf = (entries: OwedEntry[]) => sumAmounts(entries.filter((e) => e.kind === "open").map((e) => e.amount))
const inOrder = (a: OwedEntry, b: OwedEntry) =>
	Number(a.kind === "open") - Number(b.kind === "open") || b.amount - a.amount || byId(a.card, b.card)

/** The last day `range` reaches from `today`, or null for everything. */
export const rangeEnd = (range: OwedRange, today: PlainDate): PlainDate | null =>
	range === "all" ? null : addDays(today, range)

/**
 * The entries that match `view`: what is late (dated before today, most days late first) apart,
 * then each day from today to the range's end, in date order.
 */
export function owedPlan(
	entries: OwedEntry[],
	groups: LimitGroup[],
	view: OwedPlanView,
	today: PlainDate,
): { late: OwedEntry[]; days: OwedDay[] } {
	const shown = filterCards(entries, (e) => e.card, groups, view).filter((e) => view.shows.includes(e.kind))
	const late = shown
		.filter((e) => compareDates(e.date, today) < 0)
		.sort((a, b) => compareDates(a.date, b.date) || inOrder(a, b))
	const end = rangeEnd(view.range, today)
	const byDate = new Map<PlainDate, OwedEntry[]>()
	for (const e of shown) {
		if (compareDates(e.date, today) < 0 || (end && compareDates(e.date, end) > 0)) continue
		byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])
	}
	let byThen = 0
	const days = [...byDate.keys()].sort(compareDates).map((date) => {
		const dayEntries = (byDate.get(date) ?? []).sort(inOrder)
		const firm = firmOf(dayEntries)
		byThen += firm
		return { date, entries: dayEntries, firm, estimate: estimateOf(dayEntries), byThen }
	})
	return { late, days }
}

export type OwedTotals = {
	/** Every firm baht in the range. */
	total: number
	/** What the open statements hold so far, never in `total`. */
	estimate: number
	/** Days with firm money to pay. */
	payingDays: number
	next: OwedDay | null
	/** Firm money from today to 7 days on. */
	week: number
	biggest: OwedDay | null
}

const WEEK_DAYS = 7

export function owedTotals(days: OwedDay[], today: PlainDate): OwedTotals {
	const paying = days.filter((d) => d.firm > 0)
	const weekEnd = addDays(today, WEEK_DAYS)
	return {
		total: sumAmounts(paying.map((d) => d.firm)),
		estimate: sumAmounts(days.map((d) => d.estimate)),
		payingDays: paying.length,
		next: paying[0] ?? null,
		week: sumAmounts(paying.filter((d) => compareDates(d.date, weekEnd) <= 0).map((d) => d.firm)),
		biggest: paying.reduce<OwedDay | null>((top, d) => (top && top.firm >= d.firm ? top : d), null),
	}
}

/** The Monday on or before `date`. */
export function weekStart(date: PlainDate): PlainDate {
	const { year, month, day } = parseDate(date)
	const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
	return addDays(date, -((weekday + 6) % 7))
}

const monthStart = (period: Period): PlainDate => `${period}-01`
const monthEnd = (period: Period): PlainDate => {
	const { year, month } = parseDate(monthStart(period))
	return formatDate(year, month, daysInMonth(year, month))
}

/** A week or a month of days, with its totals. */
export type OwedSection = { start: PlainDate; end: PlainDate; days: OwedDay[]; firm: number; estimate: number }

/** The days in sections of a week (Monday to Sunday) or a calendar month, in date order. */
export function owedSections(days: OwedDay[], by: "week" | "month"): OwedSection[] {
	const sections: OwedSection[] = []
	for (const d of days) {
		const start = by === "week" ? weekStart(d.date) : monthStart(periodOf(d.date))
		let section = sections.at(-1)
		if (section?.start !== start) {
			section = {
				start,
				end: by === "week" ? addDays(start, WEEK_DAYS - 1) : monthEnd(periodOf(d.date)),
				days: [],
				firm: 0,
				estimate: 0,
			}
			sections.push(section)
		}
		section.days.push(d)
		section.firm += d.firm
		section.estimate += d.estimate
	}
	return sections
}

/** The months the calendar pages through: today's, then on to the last day's. */
export function owedMonths(days: OwedDay[], today: PlainDate): Period[] {
	const months = [periodOf(today)]
	const last = days.at(-1)
	if (!last) return months
	let date = monthStart(months[0] as Period)
	while (compareDates(monthEnd(periodOf(date)), last.date) < 0) {
		date = addDays(monthEnd(periodOf(date)), 1)
		months.push(periodOf(date))
	}
	return months
}

/** A calendar cell: its date, whether it is in the month shown, and that day's money. */
export type OwedCell = { date: PlainDate; inMonth: boolean; plan: OwedDay | null }

/** A calendar row: Monday to Sunday, with the firm and estimated money of its days in the month. */
export type OwedWeek = { days: OwedCell[]; firm: number; estimate: number }

/** `month` as whole weeks from Monday, each day with its plan. */
export function owedMonth(days: OwedDay[], month: Period): OwedWeek[] {
	const byDate = new Map(days.map((d) => [d.date, d]))
	const last = monthEnd(month)
	const weeks: OwedWeek[] = []
	for (let start = weekStart(monthStart(month)); compareDates(start, last) <= 0; start = addDays(start, WEEK_DAYS)) {
		const cells = Array.from({ length: WEEK_DAYS }, (_, i) => {
			const date = addDays(start, i)
			return { date, inMonth: periodOf(date) === month, plan: byDate.get(date) ?? null }
		})
		const own = cells.filter((c) => c.inMonth && c.plan).map((c) => c.plan as OwedDay)
		weeks.push({
			days: cells,
			firm: sumAmounts(own.map((d) => d.firm)),
			estimate: sumAmounts(own.map((d) => d.estimate)),
		})
	}
	return weeks
}
