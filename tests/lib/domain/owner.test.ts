import type { Card, LimitGroup, OwnerRecord } from "#lib/domain/types"

import { expect, test } from "vitest"

import {
	canDeleteOwner,
	cardOwnerOf,
	DEFAULT_OWNER,
	DEFAULT_OWNERS,
	groupLabel,
	isStartingOwner,
	ownerId,
	ownerName,
	ownerOf,
	renameOwner,
	sortOwners,
} from "#lib/domain/owner"

const card = (fields: Partial<Card> = {}): Card => ({
	id: "a2",
	name: "Card A",
	last4: "2222",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "pool",
	...fields,
})

const group = (fields: Partial<LimitGroup> = {}): LimitGroup => ({
	id: "pool",
	name: "KBank account",
	limit: 500_000,
	...fields,
})

const owners: OwnerRecord[] = [
	{ id: "KC", name: "Kamontat" },
	{ id: "NT", name: "NT" },
	{ id: "pim", name: "Pim" },
]

test("a supplementary card belongs to its own holder, not the account", () => {
	expect(cardOwnerOf(card({ supplementary: true, owner: "NT" }), group({ owner: "KC" }))).toBe("NT")
})

test("a primary card belongs to whoever owns its group", () => {
	expect(cardOwnerOf(card(), group({ owner: "RI" }))).toBe("RI")
	// An owner left on a card that is no longer supplementary does not count.
	expect(cardOwnerOf(card({ owner: "NT" }), group({ owner: "RI" }))).toBe("RI")
})

test("a supplementary card with no owner of its own falls back to the group's", () => {
	expect(cardOwnerOf(card({ supplementary: true }), group({ owner: "NT" }))).toBe("NT")
	expect(cardOwnerOf(card({ supplementary: true, owner: "" }), group({ owner: "NT" }))).toBe("NT")
})

test("a card with no group has only its own owner, or none", () => {
	expect(cardOwnerOf(card({ supplementary: true, owner: "NT" }), null)).toBe("NT")
	expect(cardOwnerOf(card(), null)).toBeNull()
})

test("names the owner a group carries, any stored owner's id", () => {
	expect(ownerOf(group({ owner: "RI" }))).toBe("RI")
	expect(ownerOf(group({ owner: "pim" }))).toBe("pim")
})

test("falls back to the default for a group stored before the field existed", () => {
	expect(ownerOf(group())).toBe(DEFAULT_OWNER)
	expect(ownerOf(group({ owner: "" }))).toBe(DEFAULT_OWNER)
})

test("the starting owners are KC, NT and RI, each named by its initials", () => {
	expect(DEFAULT_OWNERS).toEqual([
		{ id: "KC", name: "KC" },
		{ id: "NT", name: "NT" },
		{ id: "RI", name: "RI" },
	])
	expect(DEFAULT_OWNERS.map((o) => o.id)).toContain(DEFAULT_OWNER)
})

test("tells the three a version 3 backup knew from anything else", () => {
	for (const { id } of DEFAULT_OWNERS) expect(isStartingOwner(id)).toBe(true)
	// The codes are stored exactly as written: casing matters.
	for (const value of ["kc", "KCC", "", null, undefined, 7, { owner: "KC" }]) expect(isStartingOwner(value)).toBe(false)
})

test("shows an owner by its stored name, or its id when no record has it", () => {
	expect(ownerName("KC", owners)).toBe("Kamontat")
	expect(ownerName("pim", owners)).toBe("Pim")
	expect(ownerName("RI", owners)).toBe("RI")
	expect(ownerName("RI")).toBe("RI")
})

test("labels a group with its owner's name, falling back to KC", () => {
	expect(groupLabel(group({ name: "KBank", owner: "pim" }), owners)).toBe("KBank (Pim)")
	expect(groupLabel(group({ name: "KBank" }), owners)).toBe("KBank (Kamontat)")
	expect(groupLabel(group({ name: "KBank", owner: "NT" }))).toBe("KBank (NT)")
})

test("sorts owners A to Z by name", () => {
	expect(sortOwners(owners).map((o) => o.id)).toEqual(["KC", "NT", "pim"])
	expect(
		sortOwners([
			{ id: "b", name: "zed" },
			{ id: "a", name: "Amy" },
		]).map((o) => o.id),
	).toEqual(["a", "b"])
})

test("an id is a slug of the name that no owner uses yet", () => {
	expect(ownerId("Pim Ch.", [])).toBe("pim-ch")
	expect(ownerId("Pim", owners)).toBe("pim-2")
	expect(ownerId("พิม", owners)).toBe("owner")
})

test("renaming changes the name only", () => {
	expect(renameOwner(owners, "KC", "KC")[0]).toEqual({ id: "KC", name: "KC" })
	expect(renameOwner(owners, "KC", "KC")).toHaveLength(3)
})

test("an owner can't be deleted while a group or a supplementary card names it", () => {
	const cards = [card({ supplementary: true, owner: "pim" }), card({ id: "b1", owner: "NT" })]
	const groups = [group({ owner: "RI" }), group({ id: "old" })]
	expect(canDeleteOwner("pim", groups, cards)).toBe(false)
	expect(canDeleteOwner("RI", groups, cards)).toBe(false)
	// A group with no owner reads as KC.
	expect(canDeleteOwner("KC", groups, cards)).toBe(false)
	// A stale owner on a card that is not supplementary does not count.
	expect(canDeleteOwner("NT", groups, cards)).toBe(true)
})
