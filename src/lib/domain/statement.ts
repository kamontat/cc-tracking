import type { Card, Period, PlainDate } from "#lib/domain/types"

import { periodOfPurchase } from "#lib/domain/cycle"
import { addPeriods } from "#lib/domain/date"

/** The period currently accepting purchases. */
export function openPeriod(card: Card, today: PlainDate): Period {
	return periodOfPurchase(card.cycle, today)
}

/** `count` periods, newest first, starting at the open period. */
export function recentPeriods(card: Card, today: PlainDate, count: number): Period[] {
	const start = openPeriod(card, today)
	return Array.from({ length: count }, (_, index) => addPeriods(start, -index))
}
