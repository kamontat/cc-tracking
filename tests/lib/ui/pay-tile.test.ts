import type { PayChoice } from "#lib/domain/pay"
import type { GroupRoom } from "#lib/domain/room"
import type { Card, CardLedger } from "#lib/domain/types"

import { afterEach, expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { type PayTileContext, payTileContent, payTileName } from "#lib/ui/pay-tile"

/** A payment tile's text: its name, line 2's figure and urgency, line 3's facts and its rail. */
afterEach(() => setLocale("en"))

const card = (id: string, o: Partial<Card> = {}): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	...o,
})

const bill = (dueDate: string) => ({
	period: "2026-09",
	cardId: "x",
	closeDate: "2026-09-25",
	dueDate,
	total: 120_00,
	paidAmount: 0,
	remaining: 120_00,
	parts: [],
	open: false,
})

const choice = (o: Record<string, unknown> = {}): PayChoice =>
	({ card: card("A"), owed: 0, credit: 0, bill: null, urgency: "none", days: 0, ...o }) as unknown as PayChoice

const room: GroupRoom = {
	group: { id: "g1", name: "One", limit: 1_000_00, color: "rose" },
	used: 500_00,
	available: 500_00,
	held: 0,
	room: 500_00,
	level: "within",
	sharedWith: 0,
}

const context = (o: Partial<PayTileContext> = {}): PayTileContext => ({
	rooms: new Map([["g1", room]]),
	ledgers: new Map(),
	today: "2026-11-04",
	...o,
})

test("the name is the card and what it owes", () => {
	expect(payTileName(choice({ owed: 500_00, card: card("A", { name: "Alpha" }) }))).toBe("Alpha, ฿500.00 owed")
})

test("the corner is the last 4 in mono; the room is the card's group's, none without one", () => {
	const grouped = payTileContent(choice({ card: card("A", { limitGroupId: "g1" }) }), context())
	expect(grouped.corner).toBe("•••• 1234")
	expect(grouped.mono).toBe(true)
	expect(grouped.room).toBe(room)
	expect(payTileContent(choice(), context()).room).toBeNull()
	expect(payTileContent(choice({ card: card("A", { limitGroupId: "gone" }) }), context()).room).toBeNull()
})

test("line 2: what is owed, else the credit, else nothing owed", () => {
	expect(payTileContent(choice({ owed: 500_00 }), context()).figure).toEqual({ amount: "฿500.00", word: "owed" })
	const credit = payTileContent(choice({ credit: 50_00 }), context())
	expect(credit.figure).toEqual({ word: "Credit ฿50.00" })
	expect(credit.credit).toBe(50_00)
	expect(payTileContent(choice(), context()).figure).toEqual({ word: "Nothing owed" })
})

test("the aside is the urgency: overdue red, soon amber, due muted, none for credit or nothing owed", () => {
	const of = (o: Record<string, unknown>) => {
		const { aside, asideTone } = payTileContent(choice(o), context())
		return { aside, asideTone }
	}
	expect(of({ owed: 1, urgency: "overdue", days: 3, bill: bill("2026-10-28") })).toEqual({
		aside: "Overdue 3 days",
		asideTone: "bad",
	})
	expect(of({ owed: 1, urgency: "soon", days: 2, bill: bill("2026-11-02") })).toEqual({
		aside: "Due in 2 days",
		asideTone: "warn",
	})
	expect(of({ owed: 1, urgency: "due", days: 20, bill: bill("2026-11-20") })).toEqual({
		aside: "Due 20 Nov 2026",
		asideTone: undefined,
	})
	expect(of({ credit: 50_00 })).toEqual({ aside: undefined, asideTone: undefined })
	expect(of({})).toEqual({ aside: undefined, asideTone: undefined })
})

test("line 3: the bill it goes to, else the open statement's dates, kept dates first", () => {
	expect(payTileContent(choice({ owed: 1, bill: bill("2026-10-28") }), context()).facts).toBe(
		"Bill closed 25 Sep 2026 · ฿120.00 left",
	)
	expect(payTileContent(choice(), context()).facts).toBe("closes 25 Nov 2026 · due 15 Dec 2026")
	const ledgers = new Map([
		[
			"A",
			{
				statements: [{ ...bill("2026-12-08"), period: "2026-11", cardId: "A", closeDate: "2026-11-18", open: true }],
				owed: 0,
				credit: 0,
			},
		],
	]) as unknown as Map<string, CardLedger>
	expect(payTileContent(choice(), context({ ledgers })).facts).toBe("closes 18 Nov 2026 · due 08 Dec 2026")
})

test("the text follows the locale", () => {
	setLocale("th")
	expect(payTileContent(choice({ owed: 500_00 }), context()).figure?.word).not.toBe("owed")
	expect(payTileContent(choice(), context()).facts).not.toMatch(/closes/)
})
