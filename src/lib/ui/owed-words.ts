import type { OwedEntry, OwedRange, OwedSection } from "#lib/domain/owed-plan"
import type { PlainDate } from "#lib/domain/types"

import { compareDates, dayMonth, daysBetween, monthName, parseDate } from "#lib/domain/date"
import { weekStart } from "#lib/domain/owed-plan"
import { getLocale, t } from "#lib/i18n/index"

/** The words for a range: *Next 30 days*, or *Everything owed*. */
export const rangeWords = (range: OwedRange): string =>
	range === "all" ? t("owed.plan.range.all") : t("owed.plan.range.next", { count: range })

/** What an entry is, under its card: a bill's due date, a plan's bill, an open statement, or how late it is. */
export function entryNote(entry: OwedEntry, today: PlainDate): string {
	const locale = getLocale()
	if (compareDates(entry.date, today) < 0) {
		const days = daysBetween(entry.date, today)
		return days === 1 ? t("owed.plan.line.late.one") : t("owed.plan.line.late.many", { count: days })
	}
	if (entry.kind === "open") return t("owed.plan.line.open")
	if (entry.kind === "plan") {
		return entry.due ? t("owed.plan.line.plan", { date: dayMonth(entry.due, locale) }) : t("owed.plan.line.planOnly")
	}
	return t("owed.plan.line.bill", { date: dayMonth(entry.date, locale) })
}

/** A week's heading (*This week*, *Next week*, *Week of 9 Nov*) or a month's (*November 2026*). */
export function sectionName(section: OwedSection, by: "week" | "month", today: PlainDate): string {
	const locale = getLocale()
	if (by === "month") return `${monthName(section.start, locale)} ${parseDate(section.start).year}`
	const weeks = daysBetween(weekStart(today), section.start) / 7
	if (weeks === 0) return t("owed.plan.weekThis")
	if (weeks === 1) return t("owed.plan.weekNext")
	return t("owed.plan.weekOf", { date: dayMonth(section.start, locale) })
}
