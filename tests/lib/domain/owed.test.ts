import type { SortDir } from "#lib/domain/sort"
import type { Card, CardPayment, Purchase } from "#lib/domain/types"

import { describe, expect, test } from "vitest"

import { ledgersFor } from "#lib/domain/ledger"
import { OWED_DIRS, OWED_SORTS, type OwedSort, owedLeft, owedRows } from "#lib/domain/owed"

const TODAY = "2026-10-31"
const mk = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: `Name ${id}`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
})
const buy = (id: string, extra: Partial<Purchase> = {}): Purchase => ({
	id,
	cardId: "a",
	date: "2026-10-10",
	amount: 100,
	note: "",
	...extra,
})
const pay = (id: string, extra: Partial<CardPayment> = {}): CardPayment => ({
	id,
	cardId: "a",
	date: "2026-10-10",
	amount: 100,
	status: "paid",
	...extra,
})

describe("owedRows", () => {
	const cs = [mk("a"), mk("b"), mk("c"), mk("d")]
	const purchases = [
		buy("p1", { cardId: "a", date: "2026-08-10", amount: 100 }), // overdue
		buy("p2", { cardId: "b", date: "2026-10-01", amount: 900 }), // due 14 Nov
		buy("p3", { cardId: "c", date: "2026-10-01", amount: 500 }),
	]
	const ledgers = ledgersFor(cs, purchases, [], [], TODAY)
	const order = (sort: OwedSort, dir: SortDir = OWED_DIRS[sort]) =>
		owedRows(cs, ledgers, TODAY, sort, dir).map((r) => r.card.id)
	test("urgency: overdue, then most owed; zero owed left out", () => {
		expect(order("urgency")).toEqual(["a", "b", "c"])
	})
	test("card, due and left, each in its default direction", () => {
		expect(OWED_SORTS).toEqual(["urgency", "card", "due", "left"])
		expect(OWED_DIRS).toEqual({ urgency: "asc", card: "asc", due: "asc", left: "desc" })
		expect(order("card")).toEqual(["a", "b", "c"])
		expect(order("due")).toEqual(["a", "b", "c"])
		expect(order("left")).toEqual(["b", "c", "a"])
	})
	test("each runs the other way too", () => {
		expect(order("urgency", "desc")).toEqual(["c", "b", "a"])
		expect(order("card", "desc")).toEqual(["c", "b", "a"])
		// b and c are due the same day, so they keep id order either way.
		expect(order("due", "desc")).toEqual(["b", "c", "a"])
		expect(order("left", "asc")).toEqual(["a", "c", "b"])
	})
	test("only cards that owe: a card holding credit is left out (RD-25)", () => {
		const withCredit = ledgersFor(cs, purchases, [pay("m1", { cardId: "d", amount: 50 })], [], TODAY)
		expect(owedRows(cs, withCredit, TODAY, "card", "asc").map((r) => r.card.id)).toEqual(["a", "b", "c"])
	})
	test("an archived card stays while it owes", () => {
		const archived = [mk("a", { archived: true }), mk("b", { archived: true })]
		const owing = ledgersFor(archived, [buy("p1", { cardId: "a" })], [], [], TODAY)
		expect(owedRows(archived, owing, TODAY, "card").map((r) => r.card.id)).toEqual(["a"])
	})
})

describe("owedLeft", () => {
	test("what is left on the bill a payment goes to, else all the card owes", () => {
		const cs = [mk("a"), mk("b")]
		const ledgers = ledgersFor(
			cs,
			[
				buy("p1", { cardId: "a", date: "2026-09-10", amount: 300 }),
				buy("p2", { cardId: "a", date: "2026-10-28", amount: 50 }),
				buy("p3", { cardId: "b", date: "2026-10-28", amount: 70 }),
			],
			[],
			[],
			TODAY,
		)
		const rows = owedRows(cs, ledgers, TODAY, "card")
		expect(rows.map((row) => [row.card.id, owedLeft(row)])).toEqual([
			["a", 300],
			["b", 70],
		])
	})
})
