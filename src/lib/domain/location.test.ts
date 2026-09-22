import { expect, test } from "bun:test";
import { DEFAULT_LOCATION, LOCATIONS, toLocation } from "#lib/domain/location";

test("accepts each known location", () => {
	for (const location of LOCATIONS) {
		expect(toLocation(location)).toBe(location);
	}
});

test("rejects anything that is not one of the three", () => {
	// A display label is not a stored value: casing matters.
	expect(toLocation("Krabi")).toBeNull();
	expect(toLocation("chiang-mai")).toBeNull();
	expect(toLocation("")).toBeNull();
	expect(toLocation(null)).toBeNull();
	expect(toLocation(undefined)).toBeNull();
	expect(toLocation(7)).toBeNull();
	expect(toLocation({ location: "krabi" })).toBeNull();
});

test("the default is itself a known location", () => {
	expect(toLocation(DEFAULT_LOCATION)).toBe(DEFAULT_LOCATION);
});
