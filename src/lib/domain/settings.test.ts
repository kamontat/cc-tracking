import { expect, test } from "bun:test";
import { DEFAULT_SETTINGS, toSettings } from "#lib/domain/settings";

test("reads stored settings back", () => {
	expect(toSettings({ purchaseLocations: ["bangkok", "phichit"] })).toEqual({
		purchaseLocations: ["bangkok", "phichit"],
	});
});

test("falls back to the default for anything that is not stored settings", () => {
	expect(toSettings(null)).toEqual(DEFAULT_SETTINGS);
	expect(toSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	expect(toSettings("krabi")).toEqual(DEFAULT_SETTINGS);
	expect(toSettings({})).toEqual(DEFAULT_SETTINGS);
	expect(toSettings({ purchaseLocations: "krabi" })).toEqual(DEFAULT_SETTINGS);
});

test("drops a stored location the closed set no longer recognises", () => {
	expect(toSettings({ purchaseLocations: ["krabi", "chiang-mai"] })).toEqual({
		purchaseLocations: ["krabi"],
	});
});

test("an empty stored list is an answer, not an absence", () => {
	expect(toSettings({ purchaseLocations: [] })).toEqual({
		purchaseLocations: [],
	});
});
