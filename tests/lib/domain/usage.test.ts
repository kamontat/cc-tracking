import type { Card, LimitGroup, Purchase } from "#lib/domain/types"

import { describe, expect, test } from "vitest"

import { readyRows } from "#lib/domain/home"
import { cardLedger } from "#lib/domain/ledger"
import { cardUsage, matchesCard, PICK_SORTS, sortPick, USAGE_STATEMENTS } from "#lib/domain/usage"

const card = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
})

const buy = (cardId: string, date: string, amount: number): Purchase => ({
	id: `${cardId}-${date}-${amount}`,
	cardId,
	date,
	amount,
	note: "",
})

// Closes on the 25th: 11 Nov 2026 is in the statement closing 25 Nov.
const TODAY = "2026-11-11"

const usageOf = (c: Card, purchases: Purchase[]) => cardUsage(c, cardLedger(c, purchases, [], [], TODAY), TODAY)

describe("cardUsage", () => {
	test("the last 12 statements, oldest first, the open one last", () => {
		const usage = usageOf(card("A"), [])
		expect(usage.statements).toHaveLength(USAGE_STATEMENTS)
		expect(usage.statements.map((s) => s.period)).toEqual([
			"2025-12",
			"2026-01",
			"2026-02",
			"2026-03",
			"2026-04",
			"2026-05",
			"2026-06",
			"2026-07",
			"2026-08",
			"2026-09",
			"2026-10",
			"2026-11",
		])
		expect(usage.statements.map((s) => s.open)).toEqual([...Array(11).fill(false), true])
		expect(usage.statements.at(-1)?.closeDate).toBe("2026-11-25")
		expect(usage.statements[0]?.closeDate).toBe("2025-12-25")
	})

	test("each statement is what was spent in its cycle, by the card's close day", () => {
		const usage = usageOf(card("A"), [
			buy("A", "2026-10-25", 100_00), // closes the October statement
			buy("A", "2026-10-26", 200_00), // the November statement
			buy("A", "2026-11-03", 50_00),
			buy("A", "2026-09-01", 70_00),
		])
		const byPeriod = Object.fromEntries(usage.statements.map((s) => [s.period, s.total]))
		expect(byPeriod["2026-09"]).toBe(70_00)
		expect(byPeriod["2026-10"]).toBe(100_00)
		expect(byPeriod["2026-11"]).toBe(250_00)
		expect(byPeriod["2026-08"]).toBe(0)
	})

	test("another card's purchases and those before the 12 statements are left out", () => {
		const usage = usageOf(card("A"), [buy("B", "2026-11-03", 999_00), buy("A", "2025-11-20", 40_00)])
		expect(usage.total).toBe(0)
		expect(usage.lastUsed).toBeNull()
	})

	test("the total is all 12, the average is the closed ones, and last used is the latest purchase", () => {
		const usage = usageOf(card("A"), [
			buy("A", "2026-09-01", 300_00),
			buy("A", "2026-10-10", 800_00),
			buy("A", "2026-11-03", 50_00),
		])
		expect(usage.total).toBe(1_150_00)
		expect(usage.average).toBe(100_00)
		expect(usage.lastUsed).toBe("2026-11-03")
	})

	test("a purchase dated after today does not count as used", () => {
		const usage = usageOf(card("A"), [buy("A", "2026-10-01", 10_00), buy("A", "2026-11-20", 10_00)])
		expect(usage.lastUsed).toBe("2026-10-01")
	})

	test("a card with no ledger reads as never used", () => {
		const usage = cardUsage(card("A"), undefined, TODAY)
		expect(usage.total).toBe(0)
		expect(usage.statements.every((s) => s.total === 0)).toBe(true)
	})
})

describe("sortPick", () => {
	const group: LimitGroup = { id: "g1", name: "G1", limit: 100_000_00 }
	const other: LimitGroup = { id: "g2", name: "G2", limit: 50_000_00 }
	const cards = [
		card("1", { cycle: { kind: "offset", closeDay: 5, dueOffsetDays: 20 } }),
		card("2", { limitGroupId: "g2", cycle: { kind: "offset", closeDay: 28, dueOffsetDays: 10 } }),
		card("3", { cycle: { kind: "offset", closeDay: 15, dueOffsetDays: 25 } }),
	]
	const purchases = [buy("1", "2026-11-01", 500_00), buy("2", "2026-06-01", 100_00), buy("2", "2026-07-01", 100_00)]
	const ledgers = new Map(cards.map((c) => [c.id, cardLedger(c, purchases, [], [], TODAY)]))
	const rows = readyRows(
		{
			cards,
			groups: [group, other],
			ledgers,
			lists: [],
			locations: [{ id: "krabi", name: "Krabi", takesPurchases: true }],
		},
		TODAY,
	)
	const usage = new Map(cards.map((c) => [c.id, cardUsage(c, ledgers.get(c.id), TODAY)]))
	const ids = (sort: (typeof PICK_SORTS)[number]) => sortPick(rows, sort, usage).map((r) => r.card.id)

	test("offers room, least used, longest unused, close date and due date", () => {
		expect(PICK_SORTS).toEqual(["room", "least", "idle", "close", "due"])
	})

	test("most room first; ties by card id", () => {
		// Cards 1 and 3 share G1 (100,000 less 500); card 2 has G2 (50,000 less 200).
		expect(ids("room")).toEqual(["1", "3", "2"])
	})

	test("least used across the 12 statements first", () => {
		expect(ids("least")).toEqual(["3", "2", "1"])
	})

	test("longest unused first, a card never used before any", () => {
		expect(ids("idle")).toEqual(["3", "2", "1"])
	})

	test("close and due date run as the old picker's did: longest to close, latest due first", () => {
		// Card 1 closes 5 Dec (due 25 Dec), card 2 closes 28 Nov (due 8 Dec), card 3 closes 15 Nov (due 10 Dec).
		expect(ids("close")).toEqual(["1", "2", "3"])
		expect(ids("due")).toEqual(["1", "3", "2"])
	})
})

describe("matchesCard", () => {
	test("the query finds a card by id, name or last 4, in any case, trimmed", () => {
		const c = card("10", { name: "UOB Bangkok", last4: "2000" })
		expect(matchesCard(c, "")).toBe(true)
		expect(matchesCard(c, "  ")).toBe(true)
		expect(matchesCard(c, "uob")).toBe(true)
		expect(matchesCard(c, " BANGKOK ")).toBe(true)
		expect(matchesCard(c, "2000")).toBe(true)
		expect(matchesCard(c, "10")).toBe(true)
		expect(matchesCard(c, "scb")).toBe(false)
	})
})
