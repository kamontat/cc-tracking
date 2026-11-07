import type { Card, CardPayment, PurchaseList } from "#lib/domain/types"

import { afterEach, expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { listParts, money, plannedSay, plannedText, say, sayText, waitingText, whenWords } from "#lib/ui/row-text"

/** The opening row's words: pure, given the locale. Ported from the legacy `action-row` builders. */
afterEach(() => setLocale("en"))

const card = (id: string, name: string): Card => ({ id, name, last4: "1234", owner: "Ann" }) as unknown as Card

const list = (overrides: Partial<PurchaseList> = {}): PurchaseList =>
	({
		id: "l1",
		date: "2026-11-02",
		status: "sent",
		lines: [
			{ cardId: "1", amount: 500_00 },
			{ cardId: "9", amount: 250_00 },
		],
		...overrides,
	}) as unknown as PurchaseList

test("a sentence keeps its money a piece of its own and the rest words", () => {
	const sentence = say("row.say.saved", { total: money("1,000.00") })
	expect(sentence).toContainEqual({ money: "1,000.00" })
	expect(sayText(sentence)).toContain("1,000.00")
	expect(sentence.some((piece) => typeof piece === "string" && piece.includes("{"))).toBe(false)
})

test("a placeholder with no value stays visible rather than vanish", () => {
	expect(sayText(say("row.say.saved"))).toContain("{total}")
})

test("a list's parts are its lines, missing cards keep their id, and a saved list says what was made", () => {
	const cards = [card("1", "Card A")]
	expect(listParts(list(), cards)).toEqual([
		{ label: "1) Card A (1234)", amount: "฿500.00" },
		{ label: "9) —", amount: "฿250.00" },
	])
	const saved = list({
		status: "saved",
		lines: [
			{ cardId: "1", amount: 500_00, made: true, actual: 480_00 },
			{ cardId: "1", amount: 100_00, made: false },
		] as PurchaseList["lines"],
	})
	expect(listParts(saved, cards).map((p) => p.amount)).toEqual(["฿480.00", "Not made"])
})

test("a waiting list is titled by its date and names its cards", () => {
	const text = waitingText(list(), [card("1", "Card A")], [])
	expect(text.kind).toBe("waiting")
	expect(text.title).toContain("2 Nov")
	expect(text.subtitle).toContain("Card A")
})

test("a planned payment says when, and its note only in the opened sentence", () => {
	const payment = { id: "p1", cardId: "1", date: "2026-11-05", amount: 1_000_00, note: "rent" } as CardPayment
	const text = plannedText(payment, card("1", "Card A"), [], "2026-11-03")
	expect(text.subtitle).toContain(whenWords("2026-11-05", "2026-11-03"))
	expect(text.subtitle).not.toContain("rent")
	expect(plannedSay(payment)).toMatch(/rent$/)
	expect(whenWords("2026-11-03", "2026-11-03")).toBe("today")
	expect(whenWords("2026-11-04", "2026-11-03")).toBe("tomorrow")
})
