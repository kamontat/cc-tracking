import { expect, test } from "bun:test";
import { readOverRoom, savedPurchaseAddress } from "#lib/ui/purchase-address";

test("a saved purchase over the room carries the satang to the card page", () => {
	expect(savedPurchaseAddress("kbank", 12_345)).toBe(
		"/card?id=kbank&over=12345",
	);
	expect(savedPurchaseAddress("kbank", 0)).toBe("/card?id=kbank");
	expect(readOverRoom("?id=kbank&over=12345")).toBe(12_345);
});

test("only a whole number of satang above 0 is read as over the room", () => {
	for (const bad of [
		"?id=kbank",
		"?over=",
		"?over=0",
		"?over=-5",
		"?over=1.5",
		"?over=1e3",
		"?over=0x10",
		"?over=%2012",
		"?over=12abc",
		"?over=99999999999999999999",
	])
		expect(readOverRoom(bad)).toBe(0);
	expect(readOverRoom("?over=007")).toBe(7);
});
