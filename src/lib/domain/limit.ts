import type { Card, LimitGroup, PlainDate } from "#lib/domain/types";

/** One spendable card, with the room left on the pool it draws from. */
export type SpendRow = {
	card: Card;
	group: LimitGroup;
	/** Unpaid total across every card in the group. */
	used: number;
	/** `group.limit - used`. Negative when the group is over its limit. */
	available: number;
	/** The open period's dates: the statement a purchase made today lands on. */
	closeDate: PlainDate;
	dueDate: PlainDate;
	/** How many other cards share this group. 0 means the card has it to itself. */
	sharedWith: number;
};

/** How close a pool is to its limit, for tinting its usage bar. */
export type UsageLevel = "within" | "high" | "over";

/** The share of a limit, from 0 to 1, at which a pool counts as running out. */
const HIGH_USAGE = 0.8;

export function usageLevel(used: number, limit: number): UsageLevel {
	if (used > limit) return "over";
	return limit > 0 && used >= limit * HIGH_USAGE ? "high" : "within";
}

/**
 * How much of the limit is used, as a whole-number percentage clamped to 0-100 -- the width of
 * a usage bar. A zero limit reads as full the moment anything is spent against it.
 */
export function usageShare(used: number, limit: number): number {
	if (limit <= 0) return used > 0 ? 100 : 0;
	return Math.round(Math.min(1, Math.max(0, used / limit)) * 100);
}

/** Unarchived cards pointing at no group, or at one that does not exist. */
export function unassignedCards(cards: Card[], groups: LimitGroup[]): Card[] {
	return cards.filter(
		(card) =>
			!card.archived && !groups.some(({ id }) => id === card.limitGroupId),
	);
}
