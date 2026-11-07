import type { Card, LimitGroup } from "#lib/domain/types"

import { afterEach, expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import {
	cardLine,
	cardLines,
	cardName,
	cardOwnerName,
	cardRowTitle,
	cardShort,
	cardTitle,
	groupColor,
} from "#lib/ui/card-label"

/** The text forms of a card's name (UI-14, DD-98), shared by the Lit pages and the islands. */
afterEach(() => setLocale("en"))

const card: Card = {
	id: "10",
	name: "Card A10",
	last4: "4412",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g2",
}

const groups: LimitGroup[] = [
	{ id: "g1", name: "SCB", limit: 1, color: "blue" },
	{ id: "g2", name: "UOB", limit: 1, color: "rose" },
	{ id: "g5", name: "T", limit: 1, color: "nope" as never },
]

const { limitGroupId: _, ...ungrouped } = card

test("the line form reads id, name and last 4; its short form leaves the digits off", () => {
	expect(cardLine("10", card)).toBe("10) Card A10 (4412)")
	expect(cardLine("10", card, { short: true })).toBe("10) Card A10")
})

test("the line form keeps the id of a card no longer stored", () => {
	expect(cardLine("A", undefined)).toBe("A) —")
	expect(cardLine("A", undefined, { short: true })).toBe("A) —")
})

test("several cards' lines are listed with commas", () => {
	expect(cardLines(["10", "A"], [card])).toBe("10) Card A10 (4412), A) —")
	expect(cardLines(["10", "A"], [card], { short: true })).toBe("10) Card A10, A) —")
})

test("the name form is the name; its short form is c-[id]", () => {
	expect(cardName("10", card)).toBe("Card A10")
	expect(cardShort("SCB-K")).toBe("c-[SCB-K]")
	expect(cardName("5", undefined)).toBe("c-[5]")
})

test("a card's colour is its group's stored colour; none without a group or with a bad colour", () => {
	expect(groupColor({ ...card, limitGroupId: "g1" }, groups)).toBe("blue")
	expect(groupColor({ ...card, limitGroupId: "g2" }, groups)).toBe("rose")
	expect(groupColor({ ...card, limitGroupId: "g5" }, groups)).toBeNull()
	expect(groupColor({ ...card, limitGroupId: "gone" }, groups)).toBeNull()
	expect(groupColor(ungrouped, groups)).toBeNull()
	expect(groupColor(undefined, groups)).toBeNull()
})

test("cardOwnerName adds the cardholder: the group's owner, or a supplementary card's own", () => {
	const owned: LimitGroup[] = [{ id: "g2", name: "G", limit: 1, owner: "RI" }]
	expect(cardOwnerName("10", card, owned)).toBe("Card A10 (RI)")
	expect(cardOwnerName("10", { ...card, supplementary: true, owner: "NT" }, owned)).toBe("Card A10 (NT)")
	// A group with no owner is the default holder; no group at all is no holder.
	expect(cardOwnerName("10", card, [{ id: "g2", name: "G", limit: 1 }])).toBe("Card A10 (KC)")
	const { limitGroupId: _unused, ...noGroup } = card
	expect(cardOwnerName("10", noGroup, owned)).toBe("Card A10")
	expect(cardOwnerName("10", undefined, owned)).toBe("c-[10]")
})

test("card titles read name · holder (last4); holder and digits drop out when unknown", () => {
	const owned: LimitGroup[] = [{ id: "g2", name: "G", limit: 1, owner: "RI" }]
	expect(cardTitle(card, owned)).toBe("Card A10 · RI (4412)")
	expect(cardRowTitle(card, owned)).toBe("10) Card A10 · RI (4412)")
	expect(cardTitle({ ...card, supplementary: true, owner: "NT" }, owned)).toBe("Card A10 · NT (4412)")
	const { limitGroupId: _unused, ...noGroup } = card
	expect(cardTitle(noGroup, owned)).toBe("Card A10 (4412)")
	expect(cardTitle({ ...noGroup, last4: "" }, owned)).toBe("Card A10")
	expect(cardRowTitle({ ...card, last4: "" }, owned)).toBe("10) Card A10 · RI")
})
