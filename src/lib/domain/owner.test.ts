import { expect, test } from "bun:test";
import { DEFAULT_OWNER, OWNERS, ownerOf, toOwner } from "#lib/domain/owner";
import type { LimitGroup } from "#lib/domain/types";

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
