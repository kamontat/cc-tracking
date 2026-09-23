import { expect, test } from "bun:test";
import {
	canPurchaseAt,
	DEFAULT_SETTINGS,
	toSettings,
	withPurchaseAt,
} from "#lib/domain/settings";

test("only Krabi may take new purchases until someone says otherwise", () => {
	expect(canPurchaseAt(DEFAULT_SETTINGS, "krabi")).toBe(true);
	expect(canPurchaseAt(DEFAULT_SETTINGS, "bangkok")).toBe(false);
	expect(canPurchaseAt(DEFAULT_SETTINGS, "phichit")).toBe(false);
});

test("turning a location on adds it, and turning it off takes it away", () => {
	const on = withPurchaseAt(DEFAULT_SETTINGS, "bangkok", true);
	expect(canPurchaseAt(on, "bangkok")).toBe(true);
	expect(canPurchaseAt(on, "krabi")).toBe(true);

	const off = withPurchaseAt(on, "krabi", false);
	expect(canPurchaseAt(off, "krabi")).toBe(false);
	expect(canPurchaseAt(off, "bangkok")).toBe(true);
});

test("turning a location on twice does not list it twice", () => {
	const twice = withPurchaseAt(
		withPurchaseAt(DEFAULT_SETTINGS, "bangkok", true),
		"bangkok",
		true,
	);
	expect(twice.purchaseLocations).toEqual(["krabi", "bangkok"]);
});

test("does not mutate the settings handed to it", () => {
	const before = { ...DEFAULT_SETTINGS };
	withPurchaseAt(DEFAULT_SETTINGS, "bangkok", true);
	expect(DEFAULT_SETTINGS).toEqual(before);
});

test("every location may be turned off at once", () => {
	const none = { purchaseLocations: [] };
	expect(canPurchaseAt(none, "krabi")).toBe(false);
});

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
