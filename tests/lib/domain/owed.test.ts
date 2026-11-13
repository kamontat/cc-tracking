import type { SortDir } from "#lib/domain/sort"
import type { Card, CardPayment, LimitGroup, Purchase } from "#lib/domain/types"

import { describe, expect, test } from "vitest"

import { ledgersFor } from "#lib/domain/ledger"
import {
	DEFAULT_OWED_VIEW,
	OWED_DIRS,
	OWED_SORTS,
	OWED_STATES,
	type OwedSort,
	type OwedView,
	owedLeft,
	owedResults,
	owedRows,
	owedState,
} from "#lib/domain/owed"

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

describe("owedState", () => {
	test("overdue, due soon (within the pay tag's 7 days), unbilled (owes, no bill yet), else none", () => {
		const cs = [
			mk("over"),
			mk("soon", { cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 10 } }),
			mk("later"),
			mk("open"),
		]
		const ledgers = ledgersFor(
			cs,
			[
				buy("p1", { cardId: "over", date: "2026-08-10" }),
				buy("p2", { cardId: "soon", date: "2026-10-10" }),
				buy("p3", { cardId: "later", date: "2026-10-10" }),
				buy("p4", { cardId: "open", date: "2026-10-28" }),
			],
			[],
			[],
			TODAY,
		)
		const states = Object.fromEntries(owedRows(cs, ledgers, TODAY, "card").map((r) => [r.card.id, owedState(r)]))
		expect(OWED_STATES).toEqual(["overdue", "soon", "unbilled"])
		expect(states).toEqual({ over: "overdue", soon: "soon", later: null, open: "unbilled" })
	})
})

describe("owedResults", () => {
	const groups: LimitGroup[] = [
		{ id: "g1", name: "Bee", limit: 100_000, owner: "NT" },
		{ id: "g2", name: "Ant", limit: 100_000, owner: "KC" },
	]
	const cs = [
		mk("a", { location: "krabi" }),
		mk("b", { location: "bangkok", limitGroupId: "g2", name: "Platinum" }),
		mk("c", { location: "krabi", limitGroupId: "g2", last4: "9876" }),
	]
	const ledgers = ledgersFor(
		cs,
		[
			buy("p1", { cardId: "a", date: "2026-08-10", amount: 100 }), // overdue
			buy("p2", { cardId: "b", date: "2026-10-01", amount: 900 }), // due 14 Nov
			buy("p3", { cardId: "c", date: "2026-10-28", amount: 500 }), // no bill yet
		],
		[],
		[],
		TODAY,
	)
	const rows = owedRows(cs, ledgers, TODAY, "urgency")
	const view = (extra: Partial<OwedView> = {}): OwedView => ({ ...DEFAULT_OWED_VIEW, ...extra })
	const order = ["krabi", "bangkok"]
	const ids = (list: { card: Card }[] | null | undefined) => list?.map((r) => r.card.id)

	test("by default every row, flat, in the rows' order (most urgent first)", () => {
		expect(DEFAULT_OWED_VIEW).toEqual({
			q: "",
			locations: [],
			owners: [],
			states: [],
			sort: "urgency",
			dir: "asc",
			by: "none",
		})
		const all = owedResults(rows, groups, view(), order)
		expect(all.sections).toBeNull()
		expect(ids(all.flat)).toEqual(["a", "b", "c"])
		expect(all.count).toBe(3)
	})

	test("search matches the card's id, name and last 4, as Cards'", () => {
		expect(ids(owedResults(rows, groups, view({ q: "plat" }), order).flat)).toEqual(["b"])
		expect(ids(owedResults(rows, groups, view({ q: "9876" }), order).flat)).toEqual(["c"])
		expect(ids(owedResults(rows, groups, view({ q: " B " }), order).flat)).toEqual(["b"])
	})

	test("places, account holders and bill states narrow, each any of its picks", () => {
		expect(ids(owedResults(rows, groups, view({ locations: ["bangkok"] }), order).flat)).toEqual(["b"])
		expect(ids(owedResults(rows, groups, view({ owners: ["KC"] }), order).flat)).toEqual(["b", "c"])
		expect(ids(owedResults(rows, groups, view({ states: ["overdue", "unbilled"] }), order).flat)).toEqual(["a", "c"])
		expect(owedResults(rows, groups, view({ states: ["soon"] }), order).count).toBe(0)
	})

	test("grouped as on Cards, each section keeping the rows' order", () => {
		const place = owedResults(rows, groups, view({ by: "place" }), order)
		expect(place.flat).toBeNull()
		expect(place.sections?.map((s) => [s.key, ids(s.cards)])).toEqual([
			["place:krabi", ["a", "c"]],
			["place:bangkok", ["b"]],
		])
		const holder = owedResults(rows, groups, view({ by: "holder" }), order)
		expect(holder.sections?.map((s) => [s.key, ids(s.cards)])).toEqual([
			["holder:KC", ["b", "c"]],
			["holder:NT", ["a"]],
		])
		const limit = owedResults(rows, groups, view({ by: "limit" }), order)
		expect(limit.sections?.map((s) => [s.key, ids(s.cards)])).toEqual([
			["limit:g2", ["b", "c"]],
			["limit:g1", ["a"]],
		])
		expect(limit.count).toBe(3)
	})
})
