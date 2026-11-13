import type { Card, LocationRecord } from "#lib/domain/types"

import { expect, test } from "vitest"

import { canPurchase, isCardId } from "#lib/domain/card"

const card = (fields: Partial<Card>): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "bangkok",
	supplementary: false,
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	...fields,
})

const locations: LocationRecord[] = [
	{ id: "bangkok", name: "Bangkok", takesPurchases: false },
	{ id: "krabi", name: "Krabi", takesPurchases: true },
]

test("a card kept at a place that takes purchases may take one", () => {
	expect(canPurchase(card({ location: "krabi" }), locations)).toBe(true)
})

test("a card kept at a place that takes none may not", () => {
	expect(canPurchase(card({ location: "bangkok" }), locations)).toBe(false)
})

test("a card kept at a place with no record may not", () => {
	expect(canPurchase(card({ location: "phichit" }), locations)).toBe(false)
})

test("ticking a place lets every card kept there take purchases", () => {
	const ticked = locations.map((record) => ({
		...record,
		takesPurchases: true,
	}))
	expect(canPurchase(card({ location: "bangkok" }), ticked)).toBe(true)
})

test("the answer comes from the location, not from a flag left on the card", () => {
	// `canPurchase` was a per-card field once. Stored cards still carry it; it must no longer
	// decide anything.
	const stale = { ...card({ location: "bangkok" }), canPurchase: true }
	expect(canPurchase(stale as Card, locations)).toBe(false)
})

test.each(["5", "12.3", "k1.2", "0001", "a1.2.3"])("%s is a card id (RD-28)", (id) => {
	expect(isCardId(id)).toBe(true)
})

test.each(["", "5.", ".5", "1..2", "K1", "kb1", "k", "1 2", " 5", "kbank", "3/x"])(
	"%j is not a card id (RD-28)",
	(id) => {
		expect(isCardId(id)).toBe(false)
	},
)
