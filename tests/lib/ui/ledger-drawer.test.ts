import type { Card, CardPayment, Purchase } from "#lib/domain/types"

import { afterEach, expect, test } from "vitest"

import { cardLedger } from "#lib/domain/ledger"
import { byDay, type TxEntry } from "#lib/domain/transactions"
import { setLocale } from "#lib/i18n/index"
import { entryId, paymentDrawer, planId, purchaseDrawer, shownGroups } from "#lib/ui/ledger-drawer"
import { sayText } from "#lib/ui/row-text"

/** What an opened ledger row shows above its buttons: a cycle line or parts, then one sentence. */
afterEach(() => setLocale("en"))

const card = (id: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
})

const buy = (id: string, amount: number, date: string, c = card("A")): TxEntry & { kind: "purchase" } => ({
	kind: "purchase",
	purchase: { id, cardId: c.id, date, amount, note: "" },
	card: c,
})

const pay = (id: string, amount: number, date = "2026-10-31", c = card("A")): CardPayment => ({
	id,
	cardId: c.id,
	date,
	amount,
	status: "paid",
})

const bookOf = (purchases: Purchase[], payments: CardPayment[], today: string) =>
	new Map([["A", cardLedger(card("A"), purchases, payments, [], today)]])

const text = (said: ReturnType<typeof purchaseDrawer>["say"]) => (typeof said === "string" ? said : sayText(said))

test("a purchase on an open statement runs its cycle from the statement's start to its due date", () => {
	const x = buy("x", 1_000_00, "2026-10-31")
	const drawer = purchaseDrawer(x, bookOf([x.purchase], [], "2026-10-31"), "2026-10-31")
	expect(drawer.cycle).toEqual({
		start: "2026-10-19",
		end: "2026-12-03",
		marks: [
			{ kind: "buy", date: "2026-10-31" },
			{ kind: "closes", date: "2026-11-18" },
			{ kind: "due", date: "2026-12-03" },
			{ kind: "now", date: "2026-10-31" },
		],
		fillTo: "2026-10-31",
		late: false,
	})
	expect(text(drawer.say)).toBe("On the November statement: ฿1,000.00 so far, closes in 18 days.")
	expect(drawer.say).toContainEqual({ money: "฿1,000.00" })
})

test("a statement closing today or tomorrow says so", () => {
	const x = buy("x", 100_00, "2026-10-20")
	expect(text(purchaseDrawer(x, bookOf([x.purchase], [], "2026-11-18"), "2026-11-18").say)).toBe(
		"On the November statement: ฿100.00 so far, closes today.",
	)
	expect(text(purchaseDrawer(x, bookOf([x.purchase], [], "2026-11-17"), "2026-11-17").say)).toBe(
		"On the November statement: ฿100.00 so far, closes in 1 day.",
	)
})

test("a paid statement draws Closed without today and says it was paid, in either language", () => {
	const old = buy("old", 500_00, "2026-09-20")
	const books = bookOf([old.purchase], [pay("p1", 700_00)], "2026-10-31")
	const drawer = purchaseDrawer(old, books, "2026-10-31")
	expect(drawer.cycle?.marks.map((m) => m.kind)).toEqual(["buy", "closed", "due"])
	expect(drawer.cycle?.end).toBe("2026-11-02")
	expect(text(drawer.say)).toBe("Statement ฿500.00 paid.")
	setLocale("th")
	expect(text(purchaseDrawer(old, books, "2026-10-31").say)).toBe("ยอดรอบบิล ฿500.00 ชำระแล้ว")
})

test("a closed statement with money left says what is left and when; once late, in red, past today", () => {
	const old = buy("old", 500_00, "2026-09-20")
	const part = pay("p1", 100_00, "2026-10-20")
	const due = purchaseDrawer(old, bookOf([old.purchase], [part], "2026-10-31"), "2026-10-31")
	expect(due.cycle?.marks.map((m) => m.kind)).toEqual(["buy", "closed", "due", "now"])
	expect(due.cycle?.late).toBe(false)
	expect(text(due.say)).toBe("฿400.00 left of ฿500.00 billed, due in 2 days")
	expect(due.say).not.toContainEqual(expect.objectContaining({ late: expect.anything() }))

	const late = purchaseDrawer(old, bookOf([old.purchase], [part], "2026-11-05"), "2026-11-05")
	expect(late.cycle?.late).toBe(true)
	expect(late.cycle?.end).toBe("2026-11-08")
	expect(text(late.say)).toBe("฿400.00 left of ฿500.00 billed, 3 days late")
	expect(late.say).toContainEqual({ late: "3 days late" })
})

test("a purchase with no known ledger says nothing", () => {
	const x = buy("x", 100_00, "2026-10-31")
	expect(purchaseDrawer(x, new Map(), "2026-10-31")).toEqual({ say: "" })
})

test("a payment says how much reached each statement, oldest first, and any credit kept", () => {
	const old = buy("old", 500_00, "2026-09-20")
	const x = buy("x", 1_000_00, "2026-10-31")
	const p1 = pay("p1", 700_00)
	const split = paymentDrawer(p1, bookOf([old.purchase, x.purchase], [p1], "2026-10-31"))
	expect(split).toEqual({
		parts: [
			{ label: "October statement", amount: "฿500.00" },
			{ label: "November statement", amount: "฿200.00" },
		],
		say: "Paid 31 Oct.",
	})
	setLocale("th")
	expect(paymentDrawer(p1, bookOf([old.purchase, x.purchase], [p1], "2026-10-31")).say).toBe("ชำระเมื่อ 31 ต.ค.")
	setLocale("en")

	const big = pay("p1", 1_500_00)
	expect(paymentDrawer(big, bookOf([x.purchase], [big], "2026-10-31"))).toEqual({
		parts: [
			{ label: "November statement", amount: "฿1,000.00" },
			{ label: "Kept as credit", amount: "฿500.00" },
		],
		say: "Paid 31 Oct. Credit goes to the next statement first.",
	})
	expect(paymentDrawer(big, new Map())).toEqual({ parts: [], say: "Paid 31 Oct." })
})

test("row ids are unique across kinds and cards", () => {
	expect(entryId(buy("x", 1, "2026-10-31"))).toBe("buy:A:x")
	expect(entryId({ kind: "payment", payment: pay("p1", 1), card: card("A") })).toBe("pay:A:p1")
	expect(planId(pay("p1", 1))).toBe("plan:A:p1")
})

test("a limit cuts the day groups and keeps a cut day's heading", () => {
	const day = (date: string, n: number) => Array.from({ length: n }, (_, i) => buy(`${date}-${i}`, 1, date))
	const groups = byDay([...day("2026-10-31", 3), ...day("2026-10-30", 4)])
	const shown = shownGroups(groups, 5)
	expect(shown.map((g) => [g.date, g.entries.length])).toEqual([
		["2026-10-31", 3],
		["2026-10-30", 2],
	])
	expect(shownGroups(groups, 3).map((g) => g.date)).toEqual(["2026-10-31"])
})
