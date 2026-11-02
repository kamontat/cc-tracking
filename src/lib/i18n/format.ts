import { describeCycle } from "#lib/domain/cycle";
import { daysBetween } from "#lib/domain/date";
import type { Location } from "#lib/domain/location";
import type { CycleRule, LocationRecord, PlainDate } from "#lib/domain/types";
import { getLocale, t } from "#lib/i18n/index";

export const locationText = (location: Location): string =>
	t(`location.${location}` as const);

/** The English names the three seeded locations ship with. */
const defaultNames = {
	bangkok: "Bangkok",
	phichit: "Phichit",
	krabi: "Krabi",
} as const;

/**
 * A location's name as the reader sees it. A seeded location still carrying its English
 * default reads from the catalog, so it follows the language; once renamed, or when custom,
 * the stored name is shown as typed.
 */
export function locationName(
	record: Pick<LocationRecord, "id" | "name">,
): string {
	if (
		record.id in defaultNames &&
		record.name === defaultNames[record.id as keyof typeof defaultNames]
	)
		return t(`location.${record.id as keyof typeof defaultNames}` as const);
	return record.name;
}

/** A new array of `records`, A to Z by shown name in the reader's language, then by id. */
export function sortLocations<T extends Pick<LocationRecord, "id" | "name">>(
	records: T[],
): T[] {
	const locale = getLocale();
	return [...records].sort(
		(a, b) =>
			locationName(a).localeCompare(locationName(b), locale) ||
			a.id.localeCompare(b.id),
	);
}

/** The shown names of the locations that take purchases, A to Z in the reader's language. */
export function purchasePlaces(records: LocationRecord[]): string[] {
	return sortLocations(records.filter((record) => record.takesPurchases)).map(
		locationName,
	);
}

/** The shown name of the location with `id`, or `id` itself when no record has it. */
export function nameOfLocation(records: LocationRecord[], id: string): string {
	const record = records.find((r) => r.id === id);
	return record ? locationName(record) : id;
}

/** "1st", "2nd", "3rd", "18th". English only — Thai writes the bare number. */
function ordinalEn(day: number): string {
	const lastTwo = day % 100;
	if (lastTwo >= 11 && lastTwo <= 13) return `${day}th`;
	switch (day % 10) {
		case 1:
			return `${day}st`;
		case 2:
			return `${day}nd`;
		case 3:
			return `${day}rd`;
		default:
			return `${day}th`;
	}
}

const day = (value: number): string =>
	getLocale() === "en" ? ordinalEn(value) : String(value);

/**
 * How far `date` is from `from`, in words: "today", "in 9 days", "2 days ago".
 *
 * Deliberately neutral about what the date means. An overdue row reads "for 3 days", which is
 * right for a bill and wrong for a closing date, so a column that shows both kinds of date
 * needs wording that says only how far away the day is.
 */
export function relativeDayText(from: PlainDate, date: PlainDate): string {
	const days = daysBetween(from, date);
	if (days === 0) return t("relative.today");
	return days > 0
		? t("relative.inDays", { days })
		: t("relative.agoDays", { days: Math.abs(days) });
}

export function describeCycleText(rule: CycleRule): string {
	const description = describeCycle(rule);
	return description.key === "cycle.offset"
		? t("cycle.offset", {
				closeDay: day(description.params.closeDay),
				days: description.params.days,
			})
		: t("cycle.fixed", {
				closeDay: day(description.params.closeDay),
				dueDay: day(description.params.dueDay),
			});
}
