import type { CardsSort } from "#lib/domain/cards-view"

import { t } from "#lib/i18n/index"

const SORT_KEYS = {
	place: "cards.sort.place",
	room: "cards.sort.room",
	name: "cards.sort.name",
	close: "cards.sort.closeDay",
	due: "cards.sort.due",
} as const satisfies Record<CardsSort, string>

/** A Cards sort's own words, for the filter sheet and the page's sort chip, in the reader's language. */
export const cardsSortLabel = (sort: CardsSort): string => t(SORT_KEYS[sort])
