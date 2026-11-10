import type { Card } from "#lib/domain/types"

import { matchesCard } from "#lib/domain/pay"

/** How many card chips a filter sheet shows before it folds the rest and offers a find box. */
export const CARD_FOLD = 8

export type CardChoices = {
	/** The chips to draw, in card order. */
	shown: Card[]
	/** How many matching cards the fold hides. */
	hidden: number
	/** Whether there are enough cards to offer the find box (and the fold). */
	findable: boolean
}

/**
 * The cards a filter sheet's *Card* section draws. Up to `CARD_FOLD` cards are all shown. Past
 * that, a find narrows them by id, name or last 4 (`matchesCard`) and shows every match;
 * with no find and not `expanded`, the first `CARD_FOLD` show, plus any `pinned` card (picked
 * when the sheet opened or tapped since) further on, so a chip never vanishes from under a tap.
 */
export function cardChoices(cards: Card[], pinned: readonly string[], query: string, expanded: boolean): CardChoices {
	const findable = cards.length > CARD_FOLD
	if (!findable) return { shown: cards, hidden: 0, findable }
	const matching = cards.filter((card) => matchesCard(card, query))
	if (expanded || query.trim() !== "") return { shown: matching, hidden: 0, findable }
	const shown = matching.filter((card, i) => i < CARD_FOLD || pinned.includes(card.id))
	return { shown, hidden: matching.length - shown.length, findable }
}
