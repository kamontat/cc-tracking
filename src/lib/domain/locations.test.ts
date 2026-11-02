import { describe, expect, test } from "bun:test";
import {
	canDeleteLocation,
	defaultLocations,
	locationId,
	renameLocation,
	takesPurchases,
} from "#lib/domain/locations";
import { defaultSettings } from "#lib/domain/settings";
import type { Card, LocationRecord } from "#lib/domain/types";

const card = (location: string, archived = false): Card => ({
	id: `c-${location}-${archived}`,
	name: "x",
	last4: "0000",
	location: location as Card["location"],
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 25 },
	archived,
});

describe("locations", () => {
	test("defaults follow the purchase places", () => {
		const records = defaultLocations(defaultSettings());
		expect(records).toEqual([
			{ id: "bangkok", name: "Bangkok", takesPurchases: false },
			{ id: "phichit", name: "Phichit", takesPurchases: false },
			{ id: "krabi", name: "Krabi", takesPurchases: true },
		]);
	});

	test("an empty purchase list is kept", () => {
		const records = defaultLocations({ purchaseLocations: [] });
		expect(records.every((r) => !r.takesPurchases)).toBe(true);
	});

	test("id is a slug of the name", () => {
		expect(locationId("Chiang Mai", [])).toBe("chiang-mai");
		expect(locationId("  --Hat Yai!! ", [])).toBe("hat-yai");
	});

	test("id clash gets a number", () => {
		const existing = defaultLocations(defaultSettings());
		expect(locationId("Krabi", existing)).toBe("krabi-2");
		const more = [
			...existing,
			{ id: "krabi-2", name: "K", takesPurchases: false },
		];
		expect(locationId("krabi", more)).toBe("krabi-3");
	});

	test("Thai-only name gets a fallback id", () => {
		expect(locationId("เชียงใหม่", [])).toBe("location");
		const existing: LocationRecord[] = [
			{ id: "location", name: "เชียงใหม่", takesPurchases: false },
		];
		expect(locationId("ภูเก็ต", existing)).toBe("location-2");
	});

	test("rename keeps the id", () => {
		const records = defaultLocations(defaultSettings());
		const next = renameLocation(records, "krabi", "Krabi Town");
		expect(next.find((r) => r.id === "krabi")?.name).toBe("Krabi Town");
		expect(records[2]?.name).toBe("Krabi");
		expect(renameLocation(records, "nope", "X")).toEqual(records);
	});

	test("a location with an archived card can't be deleted", () => {
		expect(canDeleteLocation("krabi", [card("krabi", true)])).toBe(false);
		expect(canDeleteLocation("krabi", [card("phichit")])).toBe(true);
	});

	test("takesPurchases reads the record", () => {
		const records = defaultLocations(defaultSettings());
		expect(takesPurchases(records, "krabi")).toBe(true);
		expect(takesPurchases(records, "bangkok")).toBe(false);
		expect(takesPurchases(records, "unknown")).toBe(false);
	});
});
