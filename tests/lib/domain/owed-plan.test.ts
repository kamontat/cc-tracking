import type { Card, CardPayment, LimitGroup, Purchase } from "#lib/domain/types"

import { describe, expect, test } from "vitest"

import { ledgersFor } from "#lib/domain/ledger"
import {
	DEFAULT_OWED_PLAN,
	type OwedDay,
	type OwedEntry,
	owedEntries,
	owedMonth,
	owedMonths,
	owedPlan,
	owedSections,
	owedTotals,
	weekStart,
} from "#lib/domain/owed-plan"

// Close on the 25th, due 20 days later: October's bill closed 25 Oct and is due 14 Nov.
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
const buy = (id: string, cardId: string, date: string, amount: number): Purchase => ({
	id,
	cardId,
	date,
	amount,
	note: "",
})
const plan = (id: string, cardId: string, date: string, amount: number): CardPayment => ({
	id,
	cardId,
	date,
	amount,
	status: "planned",
})
const groups: LimitGroup[] = [
	{ id: "g1", name: "G1", limit: 1_000_000, owner: "KC" },
	{ id: "g2", name: "G2", limit: 1_000_000, owner: "NT" },
]

const brief = (e: OwedEntry) => `${e.card.id} ${e.kind} ${e.date} ${e.amount}`

const setup = (cards: Card[], purchases: Purchase[], payments: CardPayment[] = []) =>
	owedEntries(cards, ledgersFor(cards, purchases, payments, [], TODAY), payments, TODAY)

describe("owedEntries", () => {
	test("a closed bill is due on its due date; an open statement is an estimate on its own", () => {
		const entries = setup([mk("a")], [buy("p1", "a", "2026-10-10", 500), buy("p2", "a", "2026-10-28", 200)])
		expect(entries.map(brief)).toEqual(["a bill 2026-11-14 500", "a open 2026-12-15 200"])
		expect(entries[0]?.due).toBe("2026-11-14")
	})

	test("a planned payment counts on its own date and comes off the oldest bill first", () => {
		const entries = setup(
			[mk("a")],
			[buy("p1", "a", "2026-09-10", 300), buy("p2", "a", "2026-10-10", 500)],
			[plan("m1", "a", "2026-11-05", 400)],
		)
		// September's bill (due 15 Oct) is paid by the plan, and 100 of it goes on to October's.
		expect(entries.map(brief)).toEqual(["a plan 2026-11-05 400", "a bill 2026-11-14 400"])
		expect(entries[0]?.due).toBe("2026-10-15")
		expect(entries[0]?.payment?.id).toBe("m1")
	})

	test("a plan bigger than every bill takes the rest off the open statement, and all of it is to pay", () => {
		const entries = setup(
			[mk("a")],
			[buy("p1", "a", "2026-10-10", 500), buy("p2", "a", "2026-10-28", 200)],
			[plan("m1", "a", "2026-11-10", 600)],
		)
		expect(entries.map(brief)).toEqual(["a plan 2026-11-10 600", "a open 2026-12-15 100"])
	})

	test("a card that owes nothing and has no plan has no entries; paid money settles bills first", () => {
		const paid: CardPayment = { id: "m1", cardId: "a", date: "2026-10-30", amount: 500, status: "paid" }
		expect(setup([mk("a"), mk("b")], [buy("p1", "a", "2026-10-10", 500)], [paid])).toEqual([])
	})
})

describe("owedPlan", () => {
	const cards = [mk("a"), mk("b", { limitGroupId: "g2", location: "bkk" }), mk("c", { name: "Shopee" })]
	const entries = setup(
		cards,
		[
			buy("p1", "a", "2026-09-10", 300), // due 15 Oct: late
			buy("p2", "b", "2026-10-10", 500), // due 14 Nov
			buy("p3", "c", "2026-10-10", 700), // due 14 Nov
			buy("p4", "b", "2026-10-28", 50), // open, due 15 Dec
		],
		[plan("m1", "c", "2026-11-02", 200)],
	)

	test("late money goes apart; the days run in date order with what is needed by then", () => {
		const { late, days } = owedPlan(entries, groups, DEFAULT_OWED_PLAN, TODAY)
		expect(late.map(brief)).toEqual(["a bill 2026-10-15 300"])
		expect(days.map((d) => [d.date, d.firm, d.estimate, d.byThen])).toEqual([
			["2026-11-02", 200, 0, 200],
			["2026-11-14", 1000, 0, 1200],
		])
		// The open statement is due 15 Dec, past the 30 days. c's 700 less its 200 plan ties b's
		// 500, so card id breaks the tie.
		expect(days[1]?.entries.map(brief)).toEqual(["b bill 2026-11-14 500", "c bill 2026-11-14 500"])
	})

	test("a longer range takes in the open statement as an estimate, never in a total", () => {
		const { days } = owedPlan(entries, groups, { ...DEFAULT_OWED_PLAN, range: 60 }, TODAY)
		expect(days.at(-1)).toMatchObject({ date: "2026-12-15", firm: 0, estimate: 50, byThen: 1200 })
		expect(owedPlan(entries, groups, { ...DEFAULT_OWED_PLAN, range: "all" }, TODAY).days).toHaveLength(3)
	})

	test("the card filter, the search and what to show narrow every part", () => {
		const view = { ...DEFAULT_OWED_PLAN, owners: ["NT"], range: "all" as const }
		expect(owedPlan(entries, groups, view, TODAY).days.flatMap((d) => d.entries.map(brief))).toEqual([
			"b bill 2026-11-14 500",
			"b open 2026-12-15 50",
		])
		expect(owedPlan(entries, groups, { ...DEFAULT_OWED_PLAN, q: "shop" }, TODAY).late).toEqual([])
		const bills = owedPlan(entries, groups, { ...DEFAULT_OWED_PLAN, shows: ["bill"] }, TODAY)
		expect(bills.days.map((d) => d.date)).toEqual(["2026-11-14"])
		expect(owedPlan(entries, groups, { ...DEFAULT_OWED_PLAN, locations: ["bkk"] }, TODAY).late).toEqual([])
	})
})

const day = (date: string, firm: number, estimate = 0, byThen = firm): OwedDay => ({
	date,
	entries: [],
	firm,
	estimate,
	byThen,
})

describe("owedTotals", () => {
	test("the whole range, the next paying day, the next 7 days and the biggest day", () => {
		const days = [day("2026-11-02", 200), day("2026-11-07", 0, 90, 200), day("2026-11-14", 1000, 0, 1200)]
		expect(owedTotals(days, TODAY)).toEqual({
			total: 1200,
			estimate: 90,
			payingDays: 2,
			next: days[0],
			week: 200,
			biggest: days[2],
		})
		expect(owedTotals([], TODAY)).toMatchObject({ total: 0, next: null, biggest: null })
	})
})

describe("weeks and months", () => {
	test("a week starts on Monday", () => {
		expect(weekStart("2026-10-31")).toBe("2026-10-26")
		expect(weekStart("2026-11-02")).toBe("2026-11-02")
		expect(weekStart("2026-11-08")).toBe("2026-11-02")
	})

	test("sections by week or month, each with its totals, in date order", () => {
		const days = [day("2026-11-02", 200), day("2026-11-08", 50), day("2026-11-14", 1000), day("2026-12-15", 0, 50)]
		expect(owedSections(days, "week").map((s) => [s.start, s.end, s.firm, s.estimate])).toEqual([
			["2026-11-02", "2026-11-08", 250, 0],
			["2026-11-09", "2026-11-15", 1000, 0],
			["2026-12-14", "2026-12-20", 0, 50],
		])
		expect(owedSections(days, "month").map((s) => [s.start, s.end, s.days.length])).toEqual([
			["2026-11-01", "2026-11-30", 3],
			["2026-12-01", "2026-12-31", 1],
		])
	})

	test("the months to page through run from today's to the last paying day's", () => {
		expect(owedMonths([], TODAY)).toEqual(["2026-10"])
		expect(owedMonths([day("2026-12-15", 1)], TODAY)).toEqual(["2026-10", "2026-11", "2026-12"])
	})

	test("a month is whole weeks from Monday, each day with its plan and each week with its total", () => {
		const days = [day("2026-11-02", 200), day("2026-11-14", 1000), day("2026-11-30", 5), day("2026-12-01", 9)]
		const weeks = owedMonth(days, "2026-11")
		expect(weeks.map((w) => w.days[0]?.date)).toEqual([
			"2026-10-26",
			"2026-11-02",
			"2026-11-09",
			"2026-11-16",
			"2026-11-23",
			"2026-11-30",
		])
		expect(weeks[0]?.days.map((d) => d.inMonth)).toEqual([false, false, false, false, false, false, true])
		expect(weeks[1]?.days[0]?.plan?.firm).toBe(200)
		// A week's total counts only the month's own days.
		expect(weeks.map((w) => w.firm)).toEqual([0, 200, 1000, 0, 0, 5])
	})
})
