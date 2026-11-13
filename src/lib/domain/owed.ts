import type { Card, CardLedger, PlainDate } from "#lib/domain/types"

import { compareDates } from "#lib/domain/date"
import { type PayChoice, payChoices } from "#lib/domain/pay"
import { directed, type SortDir } from "#lib/domain/sort"

/** Home's _Owed_ tab (RD-25): a card that owes, with its bill, as the pay tile draws it. */
export type OwedRow = PayChoice
export type OwedSort = "urgency" | "card" | "due" | "left"

export const OWED_SORTS: readonly OwedSort[] = ["urgency", "card", "due", "left"]

/** Each *Owed* sort's own direction: most urgent, card id, soonest due, most owed first. */
export const OWED_DIRS: Record<OwedSort, SortDir> = { urgency: "asc", card: "asc", due: "asc", left: "desc" }

/**
 * Every card that owes, archived ones included while they owe; a card holding credit owes nothing,
 * so it is left out (paying ahead is its panel's _Make a payment_). In `sort`, run `dir`; ties by
 * card id either way, and under `due` a card with no bill is always last.
 */
export function owedRows(
	cards: Card[],
	ledgers: Map<string, CardLedger>,
	today: PlainDate,
	sort: OwedSort,
	dir: SortDir = OWED_DIRS[sort],
): OwedRow[] {
	const rows = payChoices(cards, ledgers, today).filter((r) => r.owed > 0)
	const byId = (a: OwedRow, b: OwedRow): number => (a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0)
	switch (sort) {
		case "urgency": {
			// `payChoices` already reads most pressing first.
			const rank = new Map(rows.map((row, i) => [row, i]))
			return rows.sort(directed((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0), dir, byId))
		}
		case "card":
			return rows.sort(directed(byId, dir, byId))
		case "left":
			return rows.sort(directed((a, b) => a.owed - b.owed, dir, byId))
		case "due": {
			const due = directed(
				(a: OwedRow, b: OwedRow) => (a.bill && b.bill ? compareDates(a.bill.dueDate, b.bill.dueDate) : 0),
				dir,
				byId,
			)
			return rows.sort((a, b) => (!a.bill || !b.bill ? (a.bill ? -1 : b.bill ? 1 : byId(a, b)) : due(a, b)))
		}
	}
}

/** What _Pay_ on a bill fills in: what is left on the bill the payment goes to, else all the card owes. */
export const owedLeft = (row: OwedRow): number => row.bill?.remaining ?? row.owed
