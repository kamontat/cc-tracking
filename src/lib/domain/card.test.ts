import { expect, test } from "bun:test";
import { canPurchase } from "#lib/domain/card";
import { DEFAULT_SETTINGS, withPurchaseAt } from "#lib/domain/settings";
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

test("a card kept where purchases are allowed may take one", () => {
	expect(canPurchase(card({ location: "krabi" }), DEFAULT_SETTINGS)).toBe(true);
});

test("a card kept anywhere else may not", () => {
	expect(canPurchase(card({ location: "bangkok" }), DEFAULT_SETTINGS)).toBe(
		false,
	);
	expect(canPurchase(card({ location: "phichit" }), DEFAULT_SETTINGS)).toBe(
		false,
	);
});

test("turning a location on lets every card kept there take purchases", () => {
	const settings = withPurchaseAt(DEFAULT_SETTINGS, "bangkok", true);
	expect(canPurchase(card({ location: "bangkok" }), settings)).toBe(true);
	expect(canPurchase(card({ location: "phichit" }), settings)).toBe(false);
});

test("the answer comes from the location, not from a flag left on the card", () => {
	// `canPurchase` was a per-card field before this moved to settings. Stored cards still
	// carry it; it must no longer decide anything.
	const stale = { ...card({ location: "bangkok" }), canPurchase: true };
	expect(canPurchase(stale as Card, DEFAULT_SETTINGS)).toBe(false);
});
