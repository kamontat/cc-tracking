import {
	addDays,
	compareDates,
	daysInMonth,
	formatDate,
	parseDate,
} from "#lib/domain/date";
import type { PlainDate } from "#lib/domain/types";

export type RangePreset = "today" | "week" | "month" | "lastMonth" | "custom";

/** Inclusive at both ends. `""` leaves that side open. */
export type DateRange = { from: PlainDate | ""; to: PlainDate | "" };

/** The dates a preset covers on `today`. Weeks run Monday to Sunday. */
export function presetRange(
	preset: Exclude<RangePreset, "custom">,
	today: PlainDate,
): { from: PlainDate; to: PlainDate } {
	const { year, month, day } = parseDate(today);
	switch (preset) {
		case "today":
			return { from: today, to: today };
		case "week": {
			const sinceMonday =
				(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
			const from = addDays(today, -sinceMonday);
			return { from, to: addDays(from, 6) };
		}
		case "month":
			return {
				from: formatDate(year, month, 1),
				to: formatDate(year, month, daysInMonth(year, month)),
			};
		case "lastMonth": {
			const [y, m] = month === 1 ? [year - 1, 12] : [year, month - 1];
			return {
				from: formatDate(y, m, 1),
				to: formatDate(y, m, daysInMonth(y, m)),
			};
		}
	}
}

/** Puts a range typed backwards the right way round, so it still means what the reader meant. */
export function normaliseRange(range: DateRange): DateRange {
	return range.from && range.to && compareDates(range.from, range.to) > 0
		? { from: range.to, to: range.from }
		: range;
}
