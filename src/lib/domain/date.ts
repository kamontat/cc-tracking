import type { DateParts, Period, PlainDate } from "#lib/domain/types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_PATTERN = /^\d{4}-\d{2}$/;
const MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const MILLIS_PER_DAY = 86_400_000;

const pad = (value: number, width: number): string =>
	String(value).padStart(width, "0");

export function parseDate(value: PlainDate): DateParts {
	if (!DATE_PATTERN.test(value)) throw new RangeError(`Not a date: ${value}`);
	return {
		year: Number(value.slice(0, 4)),
		month: Number(value.slice(5, 7)),
		day: Number(value.slice(8, 10)),
	};
}

export function formatDate(
	year: number,
	month: number,
	day: number,
): PlainDate {
	return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function daysInMonth(year: number, month: number): number {
	// Day 0 of the next month is the last day of this one.
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidDate(value: string): boolean {
	if (!DATE_PATTERN.test(value)) return false;
	const year = Number(value.slice(0, 4));
	const month = Number(value.slice(5, 7));
	const day = Number(value.slice(8, 10));
	if (month < 1 || month > 12) return false;
	return day >= 1 && day <= daysInMonth(year, month);
}

export function clampDay(year: number, month: number, day: number): PlainDate {
	return formatDate(year, month, Math.min(day, daysInMonth(year, month)));
}

const toUtc = (date: PlainDate): number => {
	const { year, month, day } = parseDate(date);
	return Date.UTC(year, month - 1, day);
};

const fromUtc = (millis: number): PlainDate => {
	const value = new Date(millis);
	return formatDate(
		value.getUTCFullYear(),
		value.getUTCMonth() + 1,
		value.getUTCDate(),
	);
};

export function addDays(date: PlainDate, days: number): PlainDate {
	return fromUtc(toUtc(date) + days * MILLIS_PER_DAY);
}

export function daysBetween(from: PlainDate, to: PlainDate): number {
	return Math.round((toUtc(to) - toUtc(from)) / MILLIS_PER_DAY);
}

export function compareDates(a: PlainDate, b: PlainDate): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** The current date in Asia/Bangkok. `now` is the only clock reading in the domain. */
export function today(now: Date = new Date()): PlainDate {
	// en-CA formats as YYYY-MM-DD, which is exactly PlainDate.
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Bangkok",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

export function displayDate(date: PlainDate): string {
	const { year, month, day } = parseDate(date);
	return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

export function periodOf(date: PlainDate): Period {
	return date.slice(0, 7);
}

export function periodParts(period: Period): { year: number; month: number } {
	if (!PERIOD_PATTERN.test(period))
		throw new RangeError(`Not a period: ${period}`);
	return {
		year: Number(period.slice(0, 4)),
		month: Number(period.slice(5, 7)),
	};
}

export function addPeriods(period: Period, delta: number): Period {
	const { year, month } = periodParts(period);
	const total = year * 12 + (month - 1) + delta;
	return `${pad(Math.floor(total / 12), 4)}-${pad((total % 12) + 1, 2)}`;
}

export function comparePeriods(a: Period, b: Period): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
