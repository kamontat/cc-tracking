import { describe, expect, test } from "bun:test";
import {
	addDays,
	addPeriods,
	clampDay,
	compareDates,
	comparePeriods,
	daysBetween,
	daysInMonth,
	displayDate,
	formatDate,
	isValidDate,
	parseDate,
	periodOf,
	periodParts,
	today,
} from "#lib/domain/date";

describe("parseDate / formatDate", () => {
	test("round trips", () => {
		expect(parseDate("2026-09-21")).toEqual({ year: 2026, month: 9, day: 21 });
		expect(formatDate(2026, 9, 21)).toBe("2026-09-21");
	});

	test("pads single digits", () => {
		expect(formatDate(2026, 1, 5)).toBe("2026-01-05");
	});
});

describe("isValidDate", () => {
	test("accepts a real date", () => {
		expect(isValidDate("2026-02-28")).toBe(true);
	});

	test("rejects a day the month does not have", () => {
		expect(isValidDate("2026-02-30")).toBe(false);
	});

	test("rejects malformed input", () => {
		expect(isValidDate("2026-9-21")).toBe(false);
		expect(isValidDate("not a date")).toBe(false);
		expect(isValidDate("2026-13-01")).toBe(false);
	});
});

describe("daysInMonth", () => {
	test("knows month lengths", () => {
		expect(daysInMonth(2026, 1)).toBe(31);
		expect(daysInMonth(2026, 4)).toBe(30);
	});

	test("knows February in common and leap years", () => {
		expect(daysInMonth(2026, 2)).toBe(28);
		expect(daysInMonth(2028, 2)).toBe(29);
		expect(daysInMonth(2000, 2)).toBe(29);
		expect(daysInMonth(1900, 2)).toBe(28);
	});
});

describe("clampDay", () => {
	test("keeps a day the month has", () => {
		expect(clampDay(2026, 9, 18)).toBe("2026-09-18");
	});

	test("clamps 31 into a short month", () => {
		expect(clampDay(2026, 2, 31)).toBe("2026-02-28");
		expect(clampDay(2028, 2, 31)).toBe("2028-02-29");
		expect(clampDay(2026, 4, 31)).toBe("2026-04-30");
	});
});

describe("addDays", () => {
	test("crosses a month boundary", () => {
		expect(addDays("2026-09-18", 15)).toBe("2026-10-03");
	});

	test("crosses a year boundary", () => {
		expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
	});

	test("crosses a leap day", () => {
		expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
	});

	test("goes backwards", () => {
		expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
	});
});

describe("daysBetween", () => {
	test("counts forward days", () => {
		expect(daysBetween("2026-09-21", "2026-10-03")).toBe(12);
	});

	test("is negative when the target is past", () => {
		expect(daysBetween("2026-09-21", "2026-09-20")).toBe(-1);
	});

	test("is zero for the same day", () => {
		expect(daysBetween("2026-09-21", "2026-09-21")).toBe(0);
	});
});

describe("compareDates", () => {
	test("orders dates", () => {
		expect(compareDates("2026-09-01", "2026-09-02")).toBeLessThan(0);
		expect(compareDates("2026-10-01", "2026-09-02")).toBeGreaterThan(0);
		expect(compareDates("2026-09-01", "2026-09-01")).toBe(0);
	});
});

describe("today", () => {
	test("reads the clock in Bangkok, not UTC", () => {
		// 2026-09-21T18:30:00Z is already 2026-09-22 in Bangkok (UTC+7).
		expect(today(new Date("2026-09-21T18:30:00Z"))).toBe("2026-09-22");
	});

	test("stays on the same day earlier in the day", () => {
		expect(today(new Date("2026-09-21T02:00:00Z"))).toBe("2026-09-21");
	});
});

describe("displayDate", () => {
	test("renders a readable date", () => {
		expect(displayDate("2026-09-21", "en")).toBe("21 Sep 2026");
	});

	test("renders a date as dd MMM yyyy in English", () => {
		expect(displayDate("2026-09-21", "en")).toBe("21 Sep 2026");
	});

	test("pads a single-digit day", () => {
		expect(displayDate("2026-09-05", "en")).toBe("05 Sep 2026");
		expect(displayDate("2026-09-05", "th")).toBe("05 ก.ย. 2026");
	});

	test("renders Thai months with a Gregorian year, never Buddhist Era", () => {
		expect(displayDate("2026-09-21", "th")).toBe("21 ก.ย. 2026");
		expect(displayDate("2026-01-01", "th")).toBe("01 ม.ค. 2026");
		expect(displayDate("2026-12-31", "th")).toBe("31 ธ.ค. 2026");
	});
});

describe("periods", () => {
	test("periodOf takes the year and month", () => {
		expect(periodOf("2026-09-21")).toBe("2026-09");
	});

	test("periodParts splits a period", () => {
		expect(periodParts("2026-09")).toEqual({ year: 2026, month: 9 });
	});

	test("addPeriods crosses years in both directions", () => {
		expect(addPeriods("2026-09", 1)).toBe("2026-10");
		expect(addPeriods("2026-12", 1)).toBe("2027-01");
		expect(addPeriods("2026-01", -1)).toBe("2025-12");
		expect(addPeriods("2026-09", -12)).toBe("2025-09");
	});

	test("comparePeriods orders periods", () => {
		expect(comparePeriods("2026-09", "2026-10")).toBeLessThan(0);
		expect(comparePeriods("2027-01", "2026-12")).toBeGreaterThan(0);
		expect(comparePeriods("2026-09", "2026-09")).toBe(0);
	});
});
