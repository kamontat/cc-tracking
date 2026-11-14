import type { OwedDay, OwedEntry, OwedRange, OwedSection, OwedTotals } from "#lib/domain/owed-plan"
import type { PlainDate } from "#lib/domain/types"
import type { GlanceFigure } from "#lib/ui/glance"

import { addDays, compareDates, dayMonth, daysBetween, monthName, parseDate } from "#lib/domain/date"
import { formatAmount } from "#lib/domain/money"
import { rangeEnd, weekStart } from "#lib/domain/owed-plan"
import { getLocale, t } from "#lib/i18n/index"
import { rangeText } from "#lib/ui/glance"
import { whenWords } from "#lib/ui/row-text"

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

/**
 * The _Owed_ tab's glance (the panel Cards and Transactions share, `GlancePanel`): the range as
 * its title and its dates as the aside, then what to pay in it (its paying days and the open
 * statements' estimate under it), the next paying day, the next 7 days, the biggest day, and,
 * while any money is late, *Late* in the money-out tone, which opens the late money (`openLate`).
 */
export function owedGlance(
	totals: OwedTotals,
	range: OwedRange,
	late: number,
	today: PlainDate,
	openLate: (() => void) | null,
	lateOpen = false,
): { title: string; aside: string | undefined; figures: GlanceFigure[] } {
	const locale = getLocale()
	const end = rangeEnd(range, today)
	const dayNote = (day: OwedDay | null) =>
		day
			? t("owed.plan.dayWhen", { date: dayMonth(day.date, locale), when: whenWords(day.date, today) })
			: t("owed.plan.none")
	const days =
		totals.payingDays === 1 ? t("owed.plan.days.one") : t("owed.plan.days.many", { count: totals.payingDays })
	const figures: GlanceFigure[] = [
		{
			field: "total",
			label: t("owed.plan.toPay"),
			text: formatAmount(totals.total),
			note:
				totals.estimate > 0 ? `${days} · ${t("owed.plan.openSoFar", { amount: formatAmount(totals.estimate) })}` : days,
		},
		{
			field: "next",
			label: t("owed.plan.next"),
			text: totals.next ? formatAmount(totals.next.firm) : t("common.none"),
			note: dayNote(totals.next),
		},
		{
			field: "week",
			label: t("owed.plan.week"),
			text: formatAmount(totals.week),
			note: t("owed.plan.weekTo", { date: dayMonth(addDays(today, 7), locale) }),
		},
		{
			field: "biggest",
			label: t("owed.plan.biggest"),
			text: totals.biggest ? formatAmount(totals.biggest.firm) : t("common.none"),
			note: dayNote(totals.biggest),
		},
	]
	if (late > 0) {
		figures.push({
			field: "late",
			label: t("owed.plan.lateTitle"),
			text: formatAmount(late),
			tone: "out",
			note: t("owed.plan.lateNote"),
			...(openLate ? { open: { run: openLate, label: t("owed.plan.lateOpen"), current: lateOpen } } : {}),
		})
	}
	return { title: rangeWords(range), aside: end ? rangeText({ from: today, to: end }, locale) : undefined, figures }
}
