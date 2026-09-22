import {
	addDays,
	addPeriods,
	clampDay,
	compareDates,
	periodOf,
	periodParts,
} from "#lib/domain/date";
import type { CycleRule, Period, PlainDate } from "#lib/domain/types";

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

export type CycleDescription =
	| { key: "cycle.offset"; params: { closeDay: number; days: number } }
	| { key: "cycle.fixed"; params: { closeDay: number; dueDay: number } };

/** The rule as a catalog key and its parameters. Wording is the i18n layer's business. */
export function describeCycle(rule: CycleRule): CycleDescription {
	return rule.kind === "offset"
		? {
				key: "cycle.offset",
				params: { closeDay: rule.closeDay, days: rule.dueOffsetDays },
			}
		: {
				key: "cycle.fixed",
				params: { closeDay: rule.closeDay, dueDay: rule.dueDay },
			};
}
