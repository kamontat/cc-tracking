import {
	addDays,
	compareDates,
	daysInMonth,
	formatDate,
	parseDate,
} from "#lib/domain/date";
import { sumAmounts } from "#lib/domain/money";
import type { PlainDate, Purchase } from "#lib/domain/types";

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

const addedMillis = (purchase: Purchase): number =>
	purchase.addedAt ? Date.parse(purchase.addedAt) : Number.NaN;

/** Latest first; a purchase with no entry time counts as the earliest. */
const byAddedDesc = (a: Purchase, b: Purchase): number =>
	(addedMillis(b) || 0) - (addedMillis(a) || 0);

/**
 * Purchases dated within `range`, on `cardId` when given, newest purchase date first and, within
 * a day, the latest entered first.
 */
export function purchasesInRange(
	purchases: Purchase[],
	range: DateRange,
	cardId?: string,
): Purchase[] {
	const { from, to } = normaliseRange(range);
	return purchases
		.filter((purchase) => !cardId || purchase.cardId === cardId)
		.filter((purchase) => !from || compareDates(purchase.date, from) >= 0)
		.filter((purchase) => !to || compareDates(purchase.date, to) <= 0)
		.sort(
			(a, b) =>
				compareDates(b.date, a.date) ||
				byAddedDesc(a, b) ||
				(a.id < b.id ? 1 : -1),
		);
}

export function rangeSummary(purchases: Purchase[]): {
	count: number;
	total: number;
	cards: number;
} {
	return {
		count: purchases.length,
		total: sumAmounts(purchases.map((purchase) => purchase.amount)),
		cards: new Set(purchases.map((purchase) => purchase.cardId)).size,
	};
}
