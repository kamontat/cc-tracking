import type { Card, CardPayment, Purchase } from "#lib/domain/types"

import { describe, expect, test } from "vitest"

import { ledgersFor } from "#lib/domain/ledger"
import { markPaid, matchesCard, payFigures, payPreview, plannedOf } from "#lib/domain/pay"

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
	note: id,
})
const pay = (id: string, date: string, status: CardPayment["status"] = "planned"): CardPayment => ({
	id,
	cardId: "a",
	date,
	amount: 100,
	status,
})

describe("pay helpers", () => {
	test("matchesCard on id, name, last4, ignoring case", () => {
		const c = mk("k1", { name: "Visa Gold", last4: "9876" })
		expect(matchesCard(c, "K1")).toBe(true)
		expect(matchesCard(c, "gold")).toBe(true)
		expect(matchesCard(c, "987")).toBe(true)
		expect(matchesCard(c, "zzz")).toBe(false)
	})

	test("payFigures", () => {
		const cards = [mk("a")]
		const ledgers = ledgersFor(cards, [buy("p", "a", "2026-08-10", 700)], [], [], TODAY)
		const l = ledgers.get("a")
		if (!l) throw new Error("no ledger")
		expect(payFigures(l, TODAY)).toEqual({
			owed: 700,
			credit: 0,
			nextBill: 700,
			overdue: true,
		})
	})

	test("payPreview", () => {
		expect(payPreview(150000, TODAY, 100000, TODAY)).toEqual({
			plan: false,
			extra: 50000,
		})
		expect(payPreview(50000, TODAY, 100000, TODAY)).toEqual({
			plan: false,
			extra: 0,
		})
		expect(payPreview(150000, "2026-11-01", 100000, TODAY)).toEqual({
			plan: true,
			extra: 0,
		})
	})

	test("markPaid", () => {
		expect(markPaid(pay("x", "2026-11-01"), TODAY)).toMatchObject({
			status: "paid",
			date: TODAY,
		})
		expect(markPaid(pay("x", "2026-10-28"), TODAY)).toMatchObject({
			status: "paid",
			date: "2026-10-28",
		})
	})

	test("plannedOf by date then id", () => {
		const out = plannedOf([
			pay("b", "2026-11-02"),
			pay("z", "2026-11-01", "paid"),
			pay("c", "2026-11-01"),
			pay("a", "2026-11-02"),
		])
		expect(out.map((p) => p.id)).toEqual(["c", "a", "b"])
	})
})
