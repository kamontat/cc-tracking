import { expect, test } from "bun:test";
import { DEFAULT_OWNER, OWNERS, ownerOf, toOwner } from "#lib/domain/owner";
import type { Card } from "#lib/domain/types";

const card = (fields: Partial<Card>): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "bangkok",
	owner: "KC",
	supplementary: false,
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
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

test("reads the owner a card carries", () => {
	expect(ownerOf(card({ owner: "RI" }))).toBe("RI");
});

test("falls back to the default for a card stored before the field existed", () => {
	const { owner: _owner, ...legacy } = card({});
	expect(ownerOf(legacy)).toBe(DEFAULT_OWNER);
});

test("falls back to the default for an owner the closed set does not know", () => {
	expect(ownerOf(card({ owner: "ZZ" as never }))).toBe(DEFAULT_OWNER);
});
