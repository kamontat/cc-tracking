import { describeCycle } from "#lib/domain/cycle";
import type { Location } from "#lib/domain/location";
import type { CycleRule } from "#lib/domain/types";
import { getLocale, t } from "#lib/i18n/index";

export const locationText = (location: Location): string =>
	t(`location.${location}` as const);

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
