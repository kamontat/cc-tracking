import type { Card, LimitGroup, LocationRecord } from "#lib/domain/types"

import { expect, test } from "vitest"

import { type CardDraft, draftOf, keptIn, readCardDraft } from "#lib/ui/card-form"

const groups: LimitGroup[] = [{ id: "pool", name: "KBank account", limit: 500_000 }]

const places: LocationRecord[] = [
	{ id: "phichit", name: "Phichit", takesPurchases: false },
	{ id: "krabi", name: "Krabi", takesPurchases: true },
	{ id: "bangkok", name: "Bangkok", takesPurchases: false },
]

const stored = (extra: Partial<Card> = {}): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "pool",
	...extra,
})

/** A valid new card's draft, offset rule, in Krabi, on the pool. */
const valid = (extra: Partial<CardDraft> = {}): CardDraft => ({
	...draftOf(null),
	text: {
		id: "12.3",
		name: "KBank Visa",
		last4: "4821",
		closeDay: "18",
		dueOffsetDays: "15",
		dueDay: "",
		comment: "",
	},
	location: "krabi",
	groupId: "pool",
	...extra,
})

test("a new card's draft is blank, on the offset rule", () => {
	const draft = draftOf(null)
	expect(draft.text.name).toBe("")
	expect(draft.kind).toBe("offset")
	expect(draft.groupId).toBe("")
	expect(draft.location).toBe("")
})

test("a stored card's draft fills every field from it", () => {
	const draft = draftOf(stored({ supplementary: true, owner: "RI", comment: "hi" }))
	expect(draft.text).toEqual({
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		closeDay: "18",
		dueOffsetDays: "15",
		dueDay: "",
		comment: "hi",
	})
	expect(draft).toMatchObject({ location: "krabi", groupId: "pool", kind: "offset", supplementary: true, owner: "RI" })
})

test("kept in: the place picked, else Bangkok while stored, else the first A to Z", () => {
	expect(keptIn("phichit", places)).toBe("phichit")
	expect(keptIn("", places)).toBe("bangkok")
	expect(keptIn("", [])).toBe("bangkok")
	expect(
		keptIn("", [
			{ id: "krabi", name: "Krabi", takesPurchases: true },
			{ id: "chiang-mai", name: "Chiang Mai", takesPurchases: false },
		]),
	).toBe("chiang-mai")
})

test("reads a complete card with an offset rule", () => {
	expect(readCardDraft(valid(), null, groups, places)).toEqual({
		ok: true,
		card: {
			id: "12.3",
			name: "KBank Visa",
			last4: "4821",
			location: "krabi",
			supplementary: false,
			cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
			comment: "",
			archived: false,
			limitGroupId: "pool",
		},
	})
})

test("reads a fixed rule when that kind is chosen", () => {
	const draft = valid({ kind: "fixed" })
	draft.text.dueDay = "5"
	const read = readCardDraft(draft, null, groups, places)
	expect(read.ok && read.card.cycle).toEqual({ kind: "fixed", closeDay: 18, dueDay: 5 })
})

test.each([
	["id", { id: " " }, "form.error.id"],
	["name", { name: "" }, "form.error.name"],
	["last4", { last4: "48" }, "form.error.last4"],
	["closeDay", { closeDay: "32" }, "form.error.closeDay"],
	["dueOffsetDays", { dueOffsetDays: "61" }, "form.error.dueOffsetDays"],
] as const)("refuses a bad %s", (_, text, key) => {
	const draft = valid()
	draft.text = { ...draft.text, ...text }
	expect(readCardDraft(draft, null, groups, places)).toEqual({ ok: false, key })
})

test.each(["5.", ".5", "1..2", "K1", "kbank"])("refuses a new card id %j outside the card id form (RD-28)", (id) => {
	const draft = valid()
	draft.text.id = id
	expect(readCardDraft(draft, null, groups, places)).toEqual({ ok: false, key: "form.error.idFormat" })
})

test("a new card id is read trimmed, then checked", () => {
	const draft = valid()
	draft.text.id = " k1.2 "
	const read = readCardDraft(draft, null, groups, places)
	expect(read.ok && read.card.id).toBe("k1.2")
})

test("refuses a bad due day on the fixed rule", () => {
	const draft = valid({ kind: "fixed" })
	draft.text.dueDay = "0"
	expect(readCardDraft(draft, null, groups, places)).toEqual({ ok: false, key: "form.error.dueDay" })
})

test("refuses a card with no limit group, or one no longer stored", () => {
	expect(readCardDraft(valid({ groupId: "" }), null, groups, places)).toEqual({
		ok: false,
		key: "form.error.limitGroup",
	})
	expect(readCardDraft(valid({ groupId: "gone" }), null, groups, places)).toEqual({
		ok: false,
		key: "form.error.limitGroup",
	})
})

test("a supplementary card needs its holder, and a primary one drops it", () => {
	expect(readCardDraft(valid({ supplementary: true }), null, groups, places)).toEqual({
		ok: false,
		key: "form.error.owner",
	})
	const supplementary = readCardDraft(valid({ supplementary: true, owner: "NT" }), null, groups, places)
	expect(supplementary.ok && supplementary.card.owner).toBe("NT")
	const primary = readCardDraft(valid({ owner: "NT" }), null, groups, places)
	expect(primary.ok && "owner" in primary.card).toBe(false)
})

test("an edited card keeps its id and archived flag, whatever is typed in the id", () => {
	const draft = valid()
	draft.text.id = "other"
	const read = readCardDraft(draft, stored({ archived: true }), groups, places)
	expect(read.ok && read.card.id).toBe("kbank")
	expect(read.ok && read.card.archived).toBe(true)
})

test("a new card with no place picked is kept in the default place", () => {
	const read = readCardDraft(valid({ location: "" }), null, groups, places)
	expect(read.ok && read.card.location).toBe("bangkok")
})
