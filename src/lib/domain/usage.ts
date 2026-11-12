import type { ReadyRow } from "#lib/domain/home"
import type { Card, CardLedger, Period, PlainDate } from "#lib/domain/types"

import { closeDateOf } from "#lib/domain/cycle"
import { compareDates } from "#lib/domain/date"
import { sortReady } from "#lib/domain/home"
import { recentPeriods } from "#lib/domain/statement"

/** How far back a card's use is shown: its last 12 statements, about a year. */
export const USAGE_STATEMENTS = 12

/** One statement cycle's spending: what the card's purchases in that period add up to. */
export type UsageStatement = {
	period: Period
	closeDate: PlainDate
	total: number
	/** The statement still taking purchases: its total is not final. */
	open: boolean
}

export type CardUsage = {
	/** Oldest first, the open statement last. */
	statements: UsageStatement[]
	/** Spent across all of them, the open one included. */
	total: number
	/** The average of the closed statements, since the open one is still filling. */
	average: number
	/** The latest purchase on or before today among them; null when there is none. */
	lastUsed: PlainDate | null
}

/**
 * What a card spent on each of its last `count` statements, from its ledger: each cycle's total
 * by the card's own close day, a closed statement's frozen close date kept.
 */
export function cardUsage(
	card: Card,
	ledger: CardLedger | undefined,
	today: PlainDate,
	count = USAGE_STATEMENTS,
): CardUsage {
	const periods = recentPeriods(card, today, count).reverse()
	const statements = periods.map((period, index) => {
		const found = ledger?.statements.find((s) => s.period === period)
		return {
			period,
			closeDate: found?.closeDate ?? closeDateOf(card.cycle, period),
			total: found?.total ?? 0,
			open: index === periods.length - 1,
		}
	})
	const kept = new Set(periods)
	let lastUsed: PlainDate | null = null
	for (const s of ledger?.statements ?? []) {
		if (!kept.has(s.period)) continue
		for (const p of s.purchases) {
			if (compareDates(p.date, today) > 0) continue
			if (lastUsed === null || compareDates(p.date, lastUsed) > 0) lastUsed = p.date
		}
	}
	const closed = statements.filter((s) => !s.open)
	const sum = (xs: UsageStatement[]) => xs.reduce((n, s) => n + s.total, 0)
	return {
		statements,
		total: sum(statements),
		average: closed.length > 0 ? Math.round(sum(closed) / closed.length) : 0,
		lastUsed,
	}
}

/** The new-list sheet's sorts: most room, least used, longest unused, longest to close, latest due. */
export type PickSort = "room" | "least" | "idle" | "close" | "due"
export const PICK_SORTS: readonly PickSort[] = ["room", "least", "idle", "close", "due"]

const byId = (a: ReadyRow, b: ReadyRow): number => (a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0)

/**
 * A new array of the ready rows in `sort`'s order, ties by card id. Room, close and due run as
 * the old picker's defaults did (DD-191); *least* puts the smallest 12-statement total first and
 * *idle* the card used longest ago, one never used first of all.
 */
export function sortPick(rows: ReadyRow[], sort: PickSort, usage: Map<string, CardUsage>): ReadyRow[] {
	if (sort === "room" || sort === "close" || sort === "due") return sortReady(rows, sort)
	const total = (row: ReadyRow) => usage.get(row.card.id)?.total ?? 0
	const last = (row: ReadyRow) => usage.get(row.card.id)?.lastUsed ?? null
	const key =
		sort === "least"
			? (a: ReadyRow, b: ReadyRow) => total(a) - total(b)
			: (a: ReadyRow, b: ReadyRow) => {
					const [x, y] = [last(a), last(b)]
					if (x === y) return 0
					if (x === null) return -1
					if (y === null) return 1
					return compareDates(x, y)
				}
	return [...rows].sort((a, b) => key(a, b) || byId(a, b))
}

/** True when the query (trimmed, any case) is in the card's id, name or last 4, or is empty. */
export function matchesCard(card: Card, query: string): boolean {
	const q = query.trim().toLowerCase()
	if (q === "") return true
	return [card.id, card.name, card.last4].some((value) => value.toLowerCase().includes(q))
}
