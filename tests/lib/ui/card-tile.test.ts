import type { Card, LimitGroup } from "#lib/domain/types"

import { expect, test } from "vitest"

import { lastFour, tileTone } from "#lib/ui/card-tile"

const card = (o: Partial<Card> = {}): Card => ({
	id: "A",
	name: "Card A",
	last4: "4821",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g1",
	...o,
})
const group = (color: unknown): LimitGroup => ({ id: "g1", name: "SCB", limit: 100, owner: "KC", color }) as LimitGroup

test("the last 4 behind dots, or nothing without one", () => {
	expect(lastFour(card())).toBe("•••• 4821")
	expect(lastFour(card({ last4: "" }))).toBe("")
})

test("the tile wears its group's colour; no group, a missing one or a bad colour wears none", () => {
	expect(tileTone(card(), [group("teal")])).toBe("teal")
	expect(tileTone(card(), [group("nope")])).toBeUndefined()
	expect(tileTone(card({ limitGroupId: "gone" }), [group("teal")])).toBeUndefined()
	const { limitGroupId: _, ...bare } = card()
	expect(tileTone(bare, [group("teal")])).toBeUndefined()
	expect(tileTone(undefined, [group("teal")])).toBeUndefined()
})
