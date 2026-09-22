import { expect, test } from "bun:test";
import { canPurchase } from "#lib/domain/card";
import type { Card } from "#lib/domain/types";

const card = (fields: Partial<Card>): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	...fields,
});

test("an explicit yes lets the card take purchases wherever it is kept", () => {
	expect(canPurchase(card({ location: "bangkok", canPurchase: true }))).toBe(
		true,
	);
});

test("an explicit no blocks the card even when it is kept at Krabi", () => {
	expect(canPurchase(card({ location: "krabi", canPurchase: false }))).toBe(
		false,
	);
});

test("a card saved before the flag existed falls back to being kept at Krabi", () => {
	expect(canPurchase(card({ location: "krabi" }))).toBe(true);
	expect(canPurchase(card({ location: "bangkok" }))).toBe(false);
	expect(canPurchase(card({ location: "phichit" }))).toBe(false);
});
