import {
	addDays,
	addPeriods,
	clampDay,
	compareDates,
	periodOf,
	periodParts,
} from "#lib/domain/date.ts";
import type { CycleRule, Period, PlainDate } from "#lib/domain/types.ts";

const ordinal = (day: number): string => {
	const suffix =
		day % 10 === 1 && day !== 11
			? "st"
			: day % 10 === 2 && day !== 12
				? "nd"
				: day % 10 === 3 && day !== 13
					? "rd"
					: "th";
	return `${day}${suffix}`;
};

/** The date the statement for `period` closes. */
export function closeDateOf(rule: CycleRule, period: Period): PlainDate {
	const { year, month } = periodParts(period);
	return clampDay(year, month, rule.closeDay);
}

/** The date payment for `period` is due. */
export function dueDateOf(rule: CycleRule, period: Period): PlainDate {
	const closeDate = closeDateOf(rule, period);
	if (rule.kind === "offset") return addDays(closeDate, rule.dueOffsetDays);

	// A due day at or before the close day belongs to the following month.
	const duePeriod =
		rule.dueDay <= rule.closeDay ? addPeriods(period, 1) : period;
	const { year, month } = periodParts(duePeriod);
	return clampDay(year, month, rule.dueDay);
}

/**
 * The statement a purchase lands on. Periods are half-open as
 * `(previousClose, thisClose]`, so a purchase on the close date belongs to that statement.
 */
export function periodOfPurchase(rule: CycleRule, date: PlainDate): Period {
	const candidate = periodOf(date);
	return compareDates(date, closeDateOf(rule, candidate)) <= 0
		? candidate
		: addPeriods(candidate, 1);
}

export function describeCycle(rule: CycleRule): string {
	const closes = `closes ${ordinal(rule.closeDay)}`;
	return rule.kind === "offset"
		? `${closes}, due ${rule.dueOffsetDays} days later`
		: `${closes}, due on the ${ordinal(rule.dueDay)}`;
}
