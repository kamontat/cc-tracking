import { expect, test } from "bun:test";
import { unassignedCards, usageLevel, usageShare } from "#lib/domain/limit";
import type { Card, LimitGroup } from "#lib/domain/types";

const card = (overrides: Partial<Card> = {}): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	supplementary: false,
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "pool",
	...overrides,
});

const group = (overrides: Partial<LimitGroup> = {}): LimitGroup => ({
	id: "pool",
	name: "KBank account",
	limit: 500_000,
	...overrides,
});

test("unassigned names the unarchived cards with no group of their own", () => {
	const noGroupCard: Card = {
		id: "nogroup",
		name: "Card",
		last4: "0000",
		location: "krabi",
		supplementary: false,
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
	};
	const oldCard: Card = {
		id: "old",
		name: "Card",
		last4: "0000",
		location: "krabi",
		supplementary: false,
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: true,
	};
	const cards = [
		card(),
		noGroupCard,
		card({ id: "ghost", limitGroupId: "deleted" }),
		oldCard,
	];
	expect(unassignedCards(cards, [group()]).map((c) => c.id)).toEqual([
		"nogroup",
		"ghost",
	]);
});

test("usage level reads within, high from 80% used, and over past the limit", () => {
	expect(usageLevel(0, 100_000)).toBe("within");
	expect(usageLevel(79_999, 100_000)).toBe("within");
	expect(usageLevel(80_000, 100_000)).toBe("high");
	expect(usageLevel(100_000, 100_000)).toBe("high");
	expect(usageLevel(100_001, 100_000)).toBe("over");
	// A zero limit has no room at all, so anything spent is over it.
	expect(usageLevel(0, 0)).toBe("within");
	expect(usageLevel(1, 0)).toBe("over");
});

test("usage share is the used fraction as a 0-100 percentage, clamped", () => {
	expect(usageShare(25_000, 100_000)).toBe(25);
	expect(usageShare(150_000, 100_000)).toBe(100);
	expect(usageShare(-5, 100_000)).toBe(0);
	expect(usageShare(5, 0)).toBe(100);
	expect(usageShare(0, 0)).toBe(0);
});
