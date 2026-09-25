import { expect, test } from "bun:test";
import {
	cardOwnerOf,
	DEFAULT_OWNER,
	groupLabel,
	OWNERS,
	ownerOf,
	toOwner,
} from "#lib/domain/owner";
import type { Card, LimitGroup } from "#lib/domain/types";

const card = (fields: Partial<Card> = {}): Card => ({
	id: "a2",
	name: "Card A",
	last4: "2222",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "pool",
	...fields,
});

test("a supplementary card belongs to its own holder, not the account", () => {
	const account = {
		id: "pool",
		name: "Card A",
		limit: 1,
		owner: "KC",
	} as const;
	expect(cardOwnerOf(card({ supplementary: true, owner: "NT" }), account)).toBe(
		"NT",
	);
});

test("a primary card belongs to whoever owns its group", () => {
	const account = {
		id: "pool",
		name: "Card A",
		limit: 1,
		owner: "RI",
	} as const;
	expect(cardOwnerOf(card(), account)).toBe("RI");
	// An owner left on a card that is no longer supplementary does not count.
	expect(cardOwnerOf(card({ owner: "NT" }), account)).toBe("RI");
});

test("a supplementary card with no owner of its own falls back to the group's", () => {
	const account = {
		id: "pool",
		name: "Card A",
		limit: 1,
		owner: "NT",
	} as const;
	expect(cardOwnerOf(card({ supplementary: true }), account)).toBe("NT");
	// Junk from an old or hand-edited backup reads the same as nothing.
	expect(
		cardOwnerOf(
			card({ supplementary: true, owner: "ZZ" as unknown as "KC" }),
			account,
		),
	).toBe("NT");
});

test("a card with no group has only its own owner, or none", () => {
	expect(cardOwnerOf(card({ supplementary: true, owner: "NT" }), null)).toBe(
		"NT",
	);
	expect(cardOwnerOf(card(), null)).toBeNull();
});

test("labels a group with its owner, falling back to KC", () => {
	expect(groupLabel({ id: "pool", name: "KBank", limit: 1, owner: "NT" })).toBe(
		"KBank (NT)",
	);
	expect(groupLabel({ id: "pool", name: "KBank", limit: 1 })).toBe(
		"KBank (KC)",
	);
});

const group = (fields: Partial<LimitGroup> = {}): LimitGroup => ({
	id: "pool",
	name: "KBank account",
	limit: 500_000,
	...fields,
});

test("accepts each known owner", () => {
	for (const owner of OWNERS) {
		expect(toOwner(owner)).toBe(owner);
	}
});

test("rejects anything that is not one of the three", () => {
	// The codes are stored exactly as written: casing matters.
	expect(toOwner("kc")).toBeNull();
	expect(toOwner("KCC")).toBeNull();
	expect(toOwner("")).toBeNull();
	expect(toOwner(null)).toBeNull();
	expect(toOwner(undefined)).toBeNull();
	expect(toOwner(7)).toBeNull();
	expect(toOwner({ owner: "KC" })).toBeNull();
});

test("the default is itself a known owner", () => {
	expect(toOwner(DEFAULT_OWNER)).toBe(DEFAULT_OWNER);
});

test("names the owner a group carries", () => {
	expect(ownerOf(group({ owner: "RI" }))).toBe("RI");
});

test("falls back to the default for a group stored before the field existed", () => {
	expect(ownerOf(group())).toBe(DEFAULT_OWNER);
});

test("falls back to the default for an owner the closed set does not know", () => {
	expect(ownerOf(group({ owner: "ZZ" as never }))).toBe(DEFAULT_OWNER);
});
