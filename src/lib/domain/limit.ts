import type { Card, LimitGroup } from "#lib/domain/types"

/** How close a pool is to its limit, for tinting its usage bar. */
export type UsageLevel = "within" | "high" | "over"

/** The share of a limit, from 0 to 1, at which a pool counts as running out. */
const HIGH_USAGE = 0.8

export function usageLevel(used: number, limit: number): UsageLevel {
	if (used > limit) return "over"
	return limit > 0 && used >= limit * HIGH_USAGE ? "high" : "within"
}

/**
 * How much of the limit is used, as a whole-number percentage clamped to 0-100 -- the width of
 * a usage bar. A zero limit reads as full the moment anything is spent against it.
 */
export function usageShare(used: number, limit: number): number {
	if (limit <= 0) return used > 0 ? 100 : 0
	return Math.round(Math.min(1, Math.max(0, used / limit)) * 100)
}

/** Unarchived cards pointing at no group, or at one that does not exist. */
export function unassignedCards(cards: Card[], groups: LimitGroup[]): Card[] {
	return cards.filter((card) => !card.archived && !groups.some(({ id }) => id === card.limitGroupId))
}
