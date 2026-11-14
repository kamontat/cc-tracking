import type { CardsRooms } from "#lib/domain/cards-view"
import type { Card, CardLedger, PlainDate } from "#lib/domain/types"

import { ledgerUrgency, nextBill } from "#lib/domain/ledger"

/** What the Cards tab's glance panels say about a set of cards (the shown ones, or a section's). */
export type CardsGlance = {
	count: number
	/** Satang: what the cards owe now, each less its own credit. */
	owed: number
	/** The cards whose oldest unpaid bill is due within 7 days, and what is left on those bills. */
	soon: { count: number; amount: number }
	/** The share of the cards' limit groups in use (`used + held`, each group once), rounded; null with no group. */
	usedPct: number | null
}

export function cardsGlance(
	cards: readonly Card[],
	rooms: CardsRooms,
	ledgers: ReadonlyMap<string, CardLedger>,
	today: PlainDate,
): CardsGlance {
	let owed = 0
	const soon = { count: 0, amount: 0 }
	for (const card of cards) {
		const ledger = ledgers.get(card.id)
		if (!ledger) continue
		owed += ledger.owed - ledger.credit
		const bill = nextBill(ledger, today)
		if (bill && ledgerUrgency(bill, today) === "soon") {
			soon.count++
			soon.amount += bill.remaining
		}
	}
	let used = 0
	let limit = 0
	for (const id of new Set(cards.map((card) => card.limitGroupId))) {
		const room = id ? rooms.get(id) : undefined
		if (!room) continue
		used += room.used + room.held
		limit += room.group.limit
	}
	const usedPct = limit > 0 ? Math.max(0, Math.round((used / limit) * 100)) : null
	return { count: cards.length, owed, soon, usedPct }
}
