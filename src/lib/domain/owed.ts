import type { Owner } from "#lib/domain/owner"
import type { Card, CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"

import { type CardListView, filterCards, type Sectioned, sectionCards } from "#lib/domain/cards-view"
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
 * Where a card's debt stands: its bill is past due, due within the pay tag's 7 days (`soon`, as
 * `ledgerUrgency`), or it owes with no bill yet (`unbilled`: all of it on the open statement).
 */
export type OwedState = "overdue" | "soon" | "unbilled"

export const OWED_STATES: readonly OwedState[] = ["overdue", "soon", "unbilled"]

/** The row's `OwedState`; null for a bill due later than soon. */
export function owedState(row: OwedRow): OwedState | null {
	if (!row.bill) return "unbilled"
	return row.urgency === "overdue" || row.urgency === "soon" ? row.urgency : null
}

/** The _Owed_ tab's view (RD-29): Cards' filter, the bill states, the sort and the grouping. */
export type OwedView = CardListView<OwedSort> & { states: OwedState[] }

/** Not grouped, most urgent first. */
export const DEFAULT_OWED_VIEW: OwedView = {
	q: "",
	locations: [],
	owners: [],
	states: [],
	sort: "urgency",
	dir: OWED_DIRS.urgency,
	by: "none",
}

/**
 * The `rows` (already in the view's sort, `owedRows`) that match the view's search, places,
 * holders and bill states (any of each), sectioned as on Cards (`sectionCards`).
 */
export function owedResults(
	rows: OwedRow[],
	groups: LimitGroup[],
	view: OwedView,
	locationOrder: readonly string[],
	ownerOrder?: readonly Owner[],
): Sectioned<OwedRow> {
	const states = (row: OwedRow) => view.states.length === 0 || view.states.includes(owedState(row) as OwedState)
	const matches = filterCards(rows, (row) => row.card, groups, view).filter(states)
	return sectionCards(view.by, matches, (row) => row.card, groups, locationOrder, ownerOrder)
}

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
