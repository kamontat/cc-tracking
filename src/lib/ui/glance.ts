import type { CardsGlance } from "#lib/domain/cards-glance"
import type { PlainDate } from "#lib/domain/types"
import type { Locale } from "#lib/i18n/catalog"
import type { RoomLevel } from "#lib/ui/room-note"

import { dayMonth, parseDate } from "#lib/domain/date"
import { formatAmount } from "#lib/domain/money"
import { t } from "#lib/i18n/index"
import { WARN_PCT } from "#lib/ui/room-note"

/** A figure's colour: money out (red), money in (green), or something to watch (warning). */
export type GlanceTone = "out" | "in" | "warn"

/** One figure in a glance panel (`GlancePanel`), as Cards and Transactions draw it. */
export type GlanceFigure = {
	/** Names the figure for tests and styles (`data-field`), never translated. */
	field: string
	label: string
	text: string
	tone?: GlanceTone
	/** A short line under the figure: *1 card*. */
	note?: string
	/** A usage bar under the figure: its share of 100 (wider is capped), its level and its words. */
	bar?: { share: number; level: RoomLevel; label: string }
}

const cardsCount = (count: number) => (count === 1 ? t("cards.page.count.one") : t("cards.page.count.many", { count }))

/**
 * The Cards tab's glance figures (DD-210): how many cards, what they owe, what is due in 7 days
 * (in the warning tone when any is) on how many cards, and their groups' used share as a bar, over
 * from past the limit and high from `WARN_PCT`, as a card tile's rail; a dash and no bar with no group.
 */
export function cardsGlanceFigures(glance: CardsGlance): GlanceFigure[] {
	const pct = glance.usedPct
	return [
		{ field: "count", label: t("cards.glance.count"), text: String(glance.count) },
		{ field: "owed", label: t("cards.glance.owed"), text: formatAmount(glance.owed) },
		{
			field: "soon",
			label: t("cards.glance.soon"),
			text: formatAmount(glance.soon.amount),
			...(glance.soon.count > 0 ? { tone: "warn" as const } : {}),
			note: cardsCount(glance.soon.count),
		},
		pct === null
			? { field: "used", label: t("cards.glance.used"), text: "—" }
			: {
					field: "used",
					label: t("cards.glance.used"),
					text: `${pct}%`,
					bar: {
						share: pct,
						level: pct > 100 ? "over" : pct >= WARN_PCT ? "high" : "within",
						label: t("limits.usage", { share: pct }),
					},
				},
	]
}

/**
 * A glance panel's dates in words: one day alone (*30 Oct 2026*), a range within a year with the
 * year once (*1 Oct – 31 Oct 2026*), across years with both (*20 Dec 2025 – 5 Jan 2026*).
 */
export function rangeText(range: { from: PlainDate; to: PlainDate }, locale: Locale): string {
	const fromYear = parseDate(range.from).year
	const toYear = parseDate(range.to).year
	const end = `${dayMonth(range.to, locale)} ${toYear}`
	if (range.from === range.to) return end
	const start = fromYear === toYear ? dayMonth(range.from, locale) : `${dayMonth(range.from, locale)} ${fromYear}`
	return `${start} – ${end}`
}
