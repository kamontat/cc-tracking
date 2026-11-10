import type { Card } from "#lib/domain/types"

import { expect, test } from "vitest"

import { CARD_FOLD, cardChoices } from "#lib/ui/card-choices"

const card = (id: string, name = `Card ${id}`, last4 = "1111"): Card => ({
	id,
	name,
	last4,
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
})

const many = (n: number) => Array.from({ length: n }, (_, i) => card(String(i + 1)))
const ids = (cards: Card[]) => cards.map((c) => c.id)

test("a short list shows every card, with no find box", () => {
	const cards = many(CARD_FOLD)
	expect(cardChoices(cards, [], "", false)).toEqual({ shown: cards, hidden: 0, findable: false })
})

test("a long list folds after the first eight and counts the rest", () => {
	const choices = cardChoices(many(12), [], "", false)
	expect(choices.findable).toBe(true)
	expect(ids(choices.shown)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"])
	expect(choices.hidden).toBe(4)
})

test("a pinned card past the fold still shows, in card order", () => {
	const choices = cardChoices(many(12), ["11"], "", false)
	expect(ids(choices.shown)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "11"])
	expect(choices.hidden).toBe(3)
})

test("expanded shows every card", () => {
	const choices = cardChoices(many(12), [], "", true)
	expect(choices.shown).toHaveLength(12)
	expect(choices.hidden).toBe(0)
})

test("a find narrows by id, name or last 4, ignoring case, and does not fold", () => {
	const cards = [...many(10), card("K", "Krungsri Gold", "4242")]
	expect(ids(cardChoices(cards, [], "krung", false).shown)).toEqual(["K"])
	expect(ids(cardChoices(cards, [], "4242", false).shown)).toEqual(["K"])
	expect(ids(cardChoices(cards, [], "KRUNGSRI", false).shown)).toEqual(["K"])
	const all = cardChoices(cards, [], "card", false)
	expect(all.shown).toHaveLength(10)
	expect(all.hidden).toBe(0)
})

test("a find that matches nothing shows nothing", () => {
	expect(cardChoices(many(12), ["3"], "zzz", false)).toEqual({ shown: [], hidden: 0, findable: true })
})
