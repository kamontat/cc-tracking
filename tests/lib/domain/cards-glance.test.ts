import type { GroupRoom } from "#lib/domain/room"
import type { Card, CardPayment, LimitGroup, Purchase } from "#lib/domain/types"

import { expect, test } from "vitest"

import { cardsGlance } from "#lib/domain/cards-glance"
import { cardLedger } from "#lib/domain/ledger"

const TODAY = "2026-10-25"
const card = (id: string, o: Partial<Card> = {}): Card => ({
	id,
	name: id,
	last4: "1234",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g",
	...o,
})
const group = (id: string, limit: number): LimitGroup => ({ id, name: id, limit, owner: "KC" })
const room = (g: LimitGroup, used: number, held = 0): GroupRoom => ({
	group: g,
	used,
	available: g.limit - used,
	held,
	room: g.limit - used - held,
	level: "within",
	sharedWith: 0,
})
const buy = (cardId: string, date: string, amount: number): Purchase => ({
	id: `p-${cardId}-${date}`,
	cardId,
	date,
	amount,
	note: "",
})
const pay = (cardId: string, amount: number): CardPayment => ({
	id: `pay-${cardId}`,
	cardId,
	date: "2026-10-01",
	amount,
	status: "paid",
})

test("counts the cards, sums what each owes less its credit, the bills due in 7 days, and the groups' used share", () => {
	const g = group("g", 100_000)
	const h = group("h", 300_000)
	const cards = [
		card("a"), // a September bill, past due
		card("b"), // an October bill due 30 October: in 7 days
		card("c", { limitGroupId: "h" }), // all on the open statement
		card("d", { limitGroupId: "h" }), // holds credit
	]
	const ledgers = new Map([
		["a", cardLedger(cards[0] as Card, [buy("a", "2026-09-05", 1_000)], [], [], TODAY)],
		["b", cardLedger(cards[1] as Card, [buy("b", "2026-10-05", 2_000)], [], [], TODAY)],
		["c", cardLedger(cards[2] as Card, [buy("c", "2026-10-20", 4_000)], [], [], TODAY)],
		["d", cardLedger(cards[3] as Card, [], [pay("d", 500)], [], TODAY)],
	])
	const rooms = new Map([
		["g", room(g, 30_000, 10_000)],
		["h", room(h, 50_000)],
	])
	expect(cardsGlance(cards, rooms, ledgers, TODAY)).toEqual({
		count: 4,
		owed: 1_000 + 2_000 + 4_000 - 500,
		soon: { count: 1, amount: 2_000 },
		// (30 000 + 10 000 + 50 000) of (100 000 + 300 000), each group once.
		usedPct: 23,
	})
})

test("no cards: nothing owed, nothing due, no used share", () => {
	expect(cardsGlance([], new Map(), new Map(), TODAY)).toEqual({
		count: 0,
		owed: 0,
		soon: { count: 0, amount: 0 },
		usedPct: null,
	})
})
