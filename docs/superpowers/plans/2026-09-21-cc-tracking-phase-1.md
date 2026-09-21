# cc-tracking Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local browser application that tracks company credit cards — where each card physically is, when its statement closes and payment is due, and which statement any purchase lands on.

**Architecture:** Pure domain logic (dates, billing cycles, statements, money) with no storage or DOM knowledge, behind an async `Repository` interface implemented over `localStorage` in this phase and over Cloudflare KV in the next. Statements are never stored; they are computed from a card's cycle rule and its purchases, with only paid statements persisting a small frozen record. Three static HTML pages built by `bun-server`, rendered with Lit components styled by Pico CSS.

**Tech Stack:** Bun 1.4.2, TypeScript, Lit 3.3.3, Pico CSS 2.1.1, `@kctools/bun-server` 0.3.2, `bun test` with `@happy-dom/global-registrator`.

**Spec:** `docs/superpowers/specs/2026-09-15-cc-tracking-design.md`

## Global Constraints

- Bun only. `bun test`, `bun run`, `bun install`, `bunx`. Never npm, node, jest, vitest, or ts-node.
- Timezone is fixed to `Asia/Bangkok`. Dates are `YYYY-MM-DD` strings. Never read or construct local-time `Date` values (`new Date(y, m, d)`, `getFullYear`, `getMonth`, `getDate`) — they drift with the host timezone. `Date.UTC` with `getUTC*` readers is permitted for day arithmetic, because it is timezone-independent, and `Intl.DateTimeFormat` with an explicit `timeZone` is the one way to read the clock.
- Money is stored and computed as **satang integers**. Never a float. Display only through `formatAmount`.
- `src/lib/domain/**` imports nothing from `src/lib/storage/**`, and never references `localStorage`, `fetch`, `window`, or `document`.
- Components receive a repository through a property. A component never constructs one.
- Card `id` is chosen by the user, is immutable after creation, and is used verbatim in storage keys.
- Statement period boundaries are half-open as `(previousClose, thisClose]`: a purchase dated exactly on the close date belongs to that statement.
- Both `CycleRule` kinds — `offset` and `fixed` — must work everywhere. Never assume one.
- Path imports use the existing subpath aliases: `#lib/*` for `./src/lib/*`, `#components/*` for `./src/components/*`.
- Commit after every task, using Conventional Commit prefixes (`feat:`, `test:`, `chore:`, `docs:`).
- This plan covers **phase 1 only**. The Cloudflare Worker and KV phase described in the spec gets its own plan; do not build it here.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `test-setup.ts` | Registers happy-dom globals for `bun test`. |
| `src/lib/domain/types.ts` | Every shared type. No logic. |
| `src/lib/domain/date.ts` | `YYYY-MM-DD` and `YYYY-MM` arithmetic, clamping, validation, display. |
| `src/lib/domain/money.ts` | Satang parsing, summing, THB formatting. |
| `src/lib/domain/cycle.ts` | `CycleRule` → close date, due date, the period a purchase falls in. |
| `src/lib/domain/statement.ts` | Assembling statements, period listing, urgency, next actionable statement. |
| `src/lib/storage/repository.ts` | `Repository` interface, `InMemoryRepository`, `StorageError`. |
| `src/lib/storage/contract.ts` | Reusable conformance suite run against every implementation. |
| `src/lib/storage/local.ts` | `LocalStorageRepository`, the phase 1 implementation. |
| `src/lib/storage/index.ts` | `createRepository()` factory and `StorageUnavailableError`. |
| `src/lib/storage/transfer.ts` | Whole-dataset JSON export and import. |
| `src/components/cc-error-banner.ts` | One failed action, its message, a retry. |
| `src/components/cc-card-form.ts` | Create and edit a card. |
| `src/components/cc-card-table.ts` | Card list with edit, archive, delete actions. |
| `src/components/cc-due-list.ts` | Dashboard panel: one actionable statement per card. |
| `src/components/cc-quick-add.ts` | Dashboard panel: add a purchase, answer when it is due. |
| `src/components/cc-location-groups.ts` | Dashboard panel: cards grouped by location. |
| `src/components/cc-statement-list.ts` | Card detail: statements, their purchases, paid state. |
| `src/routes/index.html` + `index.ts` | Dashboard page, wires the three panels to the repository. |
| `src/routes/cards.html` + `cards.ts` | Card registry page. |
| `src/routes/card.html` + `card.ts` | Single card detail page, reads `?id=`. |

---

### Task 1: Types, date arithmetic, and the test harness

**Files:**
- Create: `test-setup.ts`
- Modify: `bunfig.toml`
- Create: `src/lib/domain/types.ts`
- Create: `src/lib/domain/date.ts`
- Test: `src/lib/domain/date.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all types in `types.ts`; from `date.ts` — `parseDate(value: PlainDate): DateParts`, `formatDate(year: number, month: number, day: number): PlainDate`, `isValidDate(value: string): boolean`, `daysInMonth(year: number, month: number): number`, `clampDay(year: number, month: number, day: number): PlainDate`, `addDays(date: PlainDate, days: number): PlainDate`, `daysBetween(from: PlainDate, to: PlainDate): number`, `compareDates(a: PlainDate, b: PlainDate): number`, `today(now?: Date): PlainDate`, `displayDate(date: PlainDate): string`, `periodOf(date: PlainDate): Period`, `periodParts(period: Period): { year: number; month: number }`, `addPeriods(period: Period, delta: number): Period`, `comparePeriods(a: Period, b: Period): number`.

- [ ] **Step 1: Add the happy-dom test harness**

`test-setup.ts` runs before every test file and gives tests a `localStorage` and a DOM. Create it:

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
```

Then add the preload to `bunfig.toml`, keeping the existing `[install]` section:

```toml
[install]
exact = true

[test]
preload = ["./test-setup.ts"]
```

- [ ] **Step 2: Write `src/lib/domain/types.ts`**

No tests — this file is types only, and every later task depends on these exact names.

```ts
/** A calendar date in Asia/Bangkok, formatted `YYYY-MM-DD`. */
export type PlainDate = string;

/** A statement period, formatted `YYYY-MM`, named after the month its close date falls in. */
export type Period = string;

export type DateParts = { year: number; month: number; day: number };

export type CycleRule =
	| { kind: "offset"; closeDay: number; dueOffsetDays: number }
	| { kind: "fixed"; closeDay: number; dueDay: number };

export type Card = {
	id: string;
	name: string;
	last4: string;
	location: string;
	cycle: CycleRule;
	comment?: string;
	archived: boolean;
};

export type Purchase = {
	id: string;
	cardId: string;
	date: PlainDate;
	/** Satang. 1 THB = 100 satang. Always an integer. */
	amount: number;
	note: string;
};

export type StatementPayment = {
	cardId: string;
	period: Period;
	paidAt: PlainDate;
	/** Frozen at payment time so a later cycle edit cannot rewrite history. */
	closeDate: PlainDate;
	dueDate: PlainDate;
};

/** Derived on read, never stored. */
export type Statement = {
	cardId: string;
	period: Period;
	closeDate: PlainDate;
	dueDate: PlainDate;
	purchases: Purchase[];
	total: number;
	paid: boolean;
	payment: StatementPayment | null;
};
```

- [ ] **Step 3: Write the failing test for `src/lib/domain/date.ts`**

Create `src/lib/domain/date.test.ts`:

```ts
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
} from "#lib/domain/date.ts";

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
		expect(displayDate("2026-09-21")).toBe("21 Sep 2026");
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
```

- [ ] **Step 4: Run the test and watch it fail**

Run: `bun test src/lib/domain/date.test.ts`
Expected: FAIL — the module `#lib/domain/date.ts` does not exist yet.

- [ ] **Step 5: Implement `src/lib/domain/date.ts`**

```ts
import type { DateParts, Period, PlainDate } from "#lib/domain/types.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_PATTERN = /^\d{4}-\d{2}$/;
const MONTH_NAMES = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
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

export function formatDate(year: number, month: number, day: number): PlainDate {
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
	return formatDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
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
	if (!PERIOD_PATTERN.test(period)) throw new RangeError(`Not a period: ${period}`);
	return { year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)) };
}

export function addPeriods(period: Period, delta: number): Period {
	const { year, month } = periodParts(period);
	const total = year * 12 + (month - 1) + delta;
	return `${pad(Math.floor(total / 12), 4)}-${pad((total % 12) + 1, 2)}`;
}

export function comparePeriods(a: Period, b: Period): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `bun test src/lib/domain/date.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 7: Commit**

```bash
git add bunfig.toml test-setup.ts src/lib/domain/types.ts src/lib/domain/date.ts src/lib/domain/date.test.ts
git commit -m "feat: add domain types and Bangkok date arithmetic"
```

---

### Task 2: Money in satang

**Files:**
- Create: `src/lib/domain/money.ts`
- Test: `src/lib/domain/money.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseAmount(input: string): number` (THB text → satang integer, throws `RangeError` on anything invalid), `formatAmount(satang: number): string` (→ `฿1,234.56`), `sumAmounts(values: number[]): number`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/domain/money.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { formatAmount, parseAmount, sumAmounts } from "#lib/domain/money.ts";

describe("parseAmount", () => {
	test("reads whole baht", () => {
		expect(parseAmount("1200")).toBe(120_000);
	});

	test("reads satang", () => {
		expect(parseAmount("1234.56")).toBe(123_456);
	});

	test("pads a single decimal digit", () => {
		expect(parseAmount("10.5")).toBe(1050);
	});

	test("ignores thousands separators and surrounding space", () => {
		expect(parseAmount(" 1,234.56 ")).toBe(123_456);
	});

	test("rejects empty, negative, non-numeric, and over-precise input", () => {
		expect(() => parseAmount("")).toThrow(RangeError);
		expect(() => parseAmount("-5")).toThrow(RangeError);
		expect(() => parseAmount("abc")).toThrow(RangeError);
		expect(() => parseAmount("1.234")).toThrow(RangeError);
	});

	test("rejects zero, because a zero purchase is a mistake", () => {
		expect(() => parseAmount("0")).toThrow(RangeError);
	});
});

describe("formatAmount", () => {
	test("groups thousands and always shows satang", () => {
		expect(formatAmount(123_456)).toBe("฿1,234.56");
		expect(formatAmount(120_000)).toBe("฿1,200.00");
		expect(formatAmount(50)).toBe("฿0.50");
	});
});

describe("sumAmounts", () => {
	test("adds integers exactly", () => {
		expect(sumAmounts([123_456, 1050, 50])).toBe(124_556);
	});

	test("is zero for nothing", () => {
		expect(sumAmounts([])).toBe(0);
	});
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/lib/domain/money.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/domain/money.ts`**

```ts
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

/** Parse user-typed THB into satang. Throws RangeError on anything that is not a positive amount. */
export function parseAmount(input: string): number {
	const cleaned = input.trim().replace(/,/g, "");
	if (!AMOUNT_PATTERN.test(cleaned)) {
		throw new RangeError(`Not an amount: ${input}`);
	}
	const [baht, satang = ""] = cleaned.split(".");
	const value = Number(baht) * 100 + Number(satang.padEnd(2, "0"));
	if (value <= 0) throw new RangeError("Amount must be greater than zero");
	return value;
}

export function formatAmount(satang: number): string {
	const sign = satang < 0 ? "-" : "";
	const absolute = Math.abs(satang);
	const baht = Math.floor(absolute / 100).toLocaleString("en-US");
	return `${sign}฿${baht}.${String(absolute % 100).padStart(2, "0")}`;
}

export function sumAmounts(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/lib/domain/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/money.ts src/lib/domain/money.test.ts
git commit -m "feat: add satang money parsing and THB formatting"
```

---

### Task 3: Billing cycle rules

**Files:**
- Create: `src/lib/domain/cycle.ts`
- Test: `src/lib/domain/cycle.test.ts`

**Interfaces:**
- Consumes: `date.ts` (`clampDay`, `addDays`, `periodParts`, `addPeriods`, `periodOf`, `compareDates`), `types.ts` (`CycleRule`, `Period`, `PlainDate`).
- Produces: `closeDateOf(rule: CycleRule, period: Period): PlainDate`, `dueDateOf(rule: CycleRule, period: Period): PlainDate`, `periodOfPurchase(rule: CycleRule, date: PlainDate): Period`, `describeCycle(rule: CycleRule): string`.

This is the heart of the application. Both rule kinds, the clamping, and the half-open boundary all live here.

- [ ] **Step 1: Write the failing test**

Create `src/lib/domain/cycle.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { closeDateOf, describeCycle, dueDateOf, periodOfPurchase } from "#lib/domain/cycle.ts";
import type { CycleRule } from "#lib/domain/types.ts";

const offset: CycleRule = { kind: "offset", closeDay: 18, dueOffsetDays: 15 };
const fixed: CycleRule = { kind: "fixed", closeDay: 18, dueDay: 5 };
const fixedSameMonth: CycleRule = { kind: "fixed", closeDay: 5, dueDay: 25 };
const endOfMonth: CycleRule = { kind: "fixed", closeDay: 31, dueDay: 31 };

describe("closeDateOf", () => {
	test("uses the close day of the period's month", () => {
		expect(closeDateOf(offset, "2026-09")).toBe("2026-09-18");
		expect(closeDateOf(fixed, "2026-09")).toBe("2026-09-18");
	});

	test("clamps a close day the month does not have", () => {
		expect(closeDateOf(endOfMonth, "2026-02")).toBe("2026-02-28");
		expect(closeDateOf(endOfMonth, "2026-04")).toBe("2026-04-30");
	});
});

describe("dueDateOf, offset rule", () => {
	test("adds the offset to the close date", () => {
		expect(dueDateOf(offset, "2026-09")).toBe("2026-10-03");
	});

	test("crosses a year boundary", () => {
		expect(dueDateOf(offset, "2026-12")).toBe("2027-01-02");
	});
});

describe("dueDateOf, fixed rule", () => {
	test("falls in the next month when the due day is not after the close day", () => {
		expect(dueDateOf(fixed, "2026-09")).toBe("2026-10-05");
	});

	test("falls in the same month when the due day is after the close day", () => {
		expect(dueDateOf(fixedSameMonth, "2026-09")).toBe("2026-09-25");
	});

	test("crosses a year boundary", () => {
		expect(dueDateOf(fixed, "2026-12")).toBe("2027-01-05");
	});

	test("clamps a due day the target month does not have", () => {
		// Closes 31 Jan, due day 31 lands in February.
		expect(dueDateOf(endOfMonth, "2026-01")).toBe("2026-02-28");
	});
});

describe("periodOfPurchase", () => {
	test("a purchase before the close date belongs to that month's statement", () => {
		expect(periodOfPurchase(offset, "2026-09-05")).toBe("2026-09");
	});

	test("a purchase exactly on the close date belongs to that statement", () => {
		expect(periodOfPurchase(offset, "2026-09-18")).toBe("2026-09");
	});

	test("a purchase after the close date rolls into the next statement", () => {
		expect(periodOfPurchase(offset, "2026-09-19")).toBe("2026-10");
	});

	test("rolls across a year boundary", () => {
		expect(periodOfPurchase(offset, "2026-12-20")).toBe("2027-01");
	});

	test("respects a clamped close date", () => {
		// February 2026 closes on the 28th, so the 28th is still February's statement.
		expect(periodOfPurchase(endOfMonth, "2026-02-28")).toBe("2026-02");
	});
});

describe("describeCycle", () => {
	test("describes both kinds in words", () => {
		expect(describeCycle(offset)).toBe("closes 18th, due 15 days later");
		expect(describeCycle(fixed)).toBe("closes 18th, due on the 5th");
	});
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/lib/domain/cycle.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/domain/cycle.ts`**

```ts
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
		day % 10 === 1 && day !== 11 ? "st"
		: day % 10 === 2 && day !== 12 ? "nd"
		: day % 10 === 3 && day !== 13 ? "rd"
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
	const duePeriod = rule.dueDay <= rule.closeDay ? addPeriods(period, 1) : period;
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
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/lib/domain/cycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/cycle.ts src/lib/domain/cycle.test.ts
git commit -m "feat: compute statement close and due dates from cycle rules"
```

---

### Task 4: Statements

**Files:**
- Create: `src/lib/domain/statement.ts`
- Test: `src/lib/domain/statement.test.ts`

**Interfaces:**
- Consumes: `cycle.ts`, `date.ts`, `money.ts` (`sumAmounts`), `types.ts`.
- Produces: `buildStatement(card: Card, period: Period, purchases: Purchase[], payment?: StatementPayment | null): Statement`, `recentPeriods(card: Card, today: PlainDate, count: number): Period[]` (newest first), `nextActionable(card: Card, purchases: Purchase[], payments: StatementPayment[], today: PlainDate): Statement`, `urgencyOf(statement: Statement, today: PlainDate): Urgency`, and `export type Urgency = "overdue" | "soon" | "open" | "future"`.

Rules these functions encode:

- `buildStatement` selects the purchases whose `periodOfPurchase` equals `period`, sorted by date then id. When a payment record exists its frozen `closeDate` and `dueDate` win over the computed ones.
- `nextActionable` returns the oldest closed-but-unpaid statement; if there is none, the currently open period's statement. It never returns `null`, so the dashboard always has one row per card.
- `urgencyOf`: `future` when the statement has not closed yet, `overdue` when unpaid past its due date, `soon` when unpaid and due within 7 days, `open` otherwise (including paid).

- [ ] **Step 1: Write the failing test**

Create `src/lib/domain/statement.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
	buildStatement,
	nextActionable,
	recentPeriods,
	urgencyOf,
} from "#lib/domain/statement.ts";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "Krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const purchase = (id: string, date: string, amount: number): Purchase => ({
	id,
	cardId: "kbank",
	date,
	amount,
	note: `purchase ${id}`,
});

const purchases = [
	purchase("a", "2026-09-05", 10_000),
	purchase("b", "2026-09-18", 25_000), // on the close date: September
	purchase("c", "2026-09-19", 50_000), // after it: October
];

describe("buildStatement", () => {
	test("collects the period's purchases and totals them", () => {
		const statement = buildStatement(card, "2026-09", purchases);
		expect(statement.purchases.map((p) => p.id)).toEqual(["a", "b"]);
		expect(statement.total).toBe(35_000);
	});

	test("computes close and due dates from the card's rule", () => {
		const statement = buildStatement(card, "2026-09", purchases);
		expect(statement.closeDate).toBe("2026-09-18");
		expect(statement.dueDate).toBe("2026-10-03");
	});

	test("is unpaid with no payment record", () => {
		expect(buildStatement(card, "2026-09", purchases).paid).toBe(false);
	});

	test("prefers the payment's frozen dates over recomputed ones", () => {
		const payment: StatementPayment = {
			cardId: "kbank",
			period: "2026-09",
			paidAt: "2026-10-01",
			closeDate: "2026-09-15", // the rule said the 15th back then
			dueDate: "2026-09-30",
		};
		const statement = buildStatement(card, "2026-09", purchases, payment);
		expect(statement.paid).toBe(true);
		expect(statement.closeDate).toBe("2026-09-15");
		expect(statement.dueDate).toBe("2026-09-30");
		expect(statement.payment).toBe(payment);
	});

	test("is empty, not broken, for a period with no purchases", () => {
		const statement = buildStatement(card, "2026-07", purchases);
		expect(statement.purchases).toEqual([]);
		expect(statement.total).toBe(0);
	});
});

describe("recentPeriods", () => {
	test("returns periods newest first, starting from the open one", () => {
		// 2026-09-21 is past the 18th, so the open period is October.
		expect(recentPeriods(card, "2026-09-21", 3)).toEqual(["2026-10", "2026-09", "2026-08"]);
	});

	test("returns the open period alone when asked for one", () => {
		expect(recentPeriods(card, "2026-09-10", 1)).toEqual(["2026-09"]);
	});
});

describe("nextActionable", () => {
	test("returns the oldest closed unpaid statement", () => {
		const statement = nextActionable(card, purchases, [], "2026-09-25");
		expect(statement.period).toBe("2026-09");
		expect(statement.paid).toBe(false);
	});

	test("skips a paid statement and moves to the next unpaid one", () => {
		const payments: StatementPayment[] = [
			{
				cardId: "kbank",
				period: "2026-09",
				paidAt: "2026-09-30",
				closeDate: "2026-09-18",
				dueDate: "2026-10-03",
			},
		];
		const statement = nextActionable(card, purchases, payments, "2026-09-25");
		expect(statement.period).toBe("2026-10");
	});

	test("returns the open period when nothing has closed unpaid", () => {
		const statement = nextActionable(card, [], [], "2026-09-10");
		expect(statement.period).toBe("2026-09");
		expect(statement.total).toBe(0);
	});
});

describe("urgencyOf", () => {
	// One statement: closes 18 Sep 2026, due 3 Oct 2026. Only "today" moves.
	const september = buildStatement(card, "2026-09", purchases);

	test("is future before the statement closes", () => {
		expect(urgencyOf(september, "2026-09-10")).toBe("future");
	});

	test("is overdue after the due date", () => {
		expect(urgencyOf(september, "2026-10-04")).toBe("overdue");
	});

	test("is soon within seven days of the due date", () => {
		expect(urgencyOf(september, "2026-09-28")).toBe("soon");
	});

	test("is open when closed but still far from due", () => {
		expect(urgencyOf(september, "2026-09-19")).toBe("open");
	});

	test("is open once paid, however late", () => {
		const payment: StatementPayment = {
			cardId: "kbank",
			period: "2026-09",
			paidAt: "2026-10-05",
			closeDate: "2026-09-18",
			dueDate: "2026-10-03",
		};
		const paid = buildStatement(card, "2026-09", purchases, payment);
		expect(urgencyOf(paid, "2026-10-10")).toBe("open");
	});
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/lib/domain/statement.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/domain/statement.ts`**

```ts
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle.ts";
import {
	addPeriods,
	compareDates,
	comparePeriods,
	daysBetween,
} from "#lib/domain/date.ts";
import { sumAmounts } from "#lib/domain/money.ts";
import type {
	Card,
	Period,
	PlainDate,
	Purchase,
	Statement,
	StatementPayment,
} from "#lib/domain/types.ts";

export type Urgency = "overdue" | "soon" | "open" | "future";

const DUE_SOON_DAYS = 7;

export function buildStatement(
	card: Card,
	period: Period,
	purchases: Purchase[],
	payment: StatementPayment | null = null,
): Statement {
	const mine = purchases
		.filter((p) => p.cardId === card.id && periodOfPurchase(card.cycle, p.date) === period)
		.sort((a, b) => compareDates(a.date, b.date) || (a.id < b.id ? -1 : 1));

	return {
		cardId: card.id,
		period,
		closeDate: payment?.closeDate ?? closeDateOf(card.cycle, period),
		dueDate: payment?.dueDate ?? dueDateOf(card.cycle, period),
		purchases: mine,
		total: sumAmounts(mine.map((p) => p.amount)),
		paid: payment !== null,
		payment,
	};
}

/** The period currently accepting purchases. */
export function openPeriod(card: Card, today: PlainDate): Period {
	return periodOfPurchase(card.cycle, today);
}

/** `count` periods, newest first, starting at the open period. */
export function recentPeriods(card: Card, today: PlainDate, count: number): Period[] {
	const start = openPeriod(card, today);
	return Array.from({ length: count }, (_, index) => addPeriods(start, -index));
}

/**
 * The statement needing attention: the oldest closed statement that is still unpaid,
 * or the open period when every closed statement is settled.
 */
export function nextActionable(
	card: Card,
	purchases: Purchase[],
	payments: StatementPayment[],
	today: PlainDate,
): Statement {
	const paymentFor = (period: Period): StatementPayment | null =>
		payments.find((p) => p.cardId === card.id && p.period === period) ?? null;

	const open = openPeriod(card, today);
	const earliest = purchases
		.filter((p) => p.cardId === card.id)
		.map((p) => periodOfPurchase(card.cycle, p.date))
		.sort(comparePeriods)[0];

	// Walk from the earliest period that could owe money up to the open one.
	let period = earliest && comparePeriods(earliest, open) < 0 ? earliest : open;
	while (comparePeriods(period, open) < 0) {
		const statement = buildStatement(card, period, purchases, paymentFor(period));
		if (!statement.paid) return statement;
		period = addPeriods(period, 1);
	}
	return buildStatement(card, open, purchases, paymentFor(open));
}

export function urgencyOf(statement: Statement, today: PlainDate): Urgency {
	if (compareDates(today, statement.closeDate) <= 0) return "future";
	if (statement.paid) return "open";
	const remaining = daysBetween(today, statement.dueDate);
	if (remaining < 0) return "overdue";
	return remaining <= DUE_SOON_DAYS ? "soon" : "open";
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/lib/domain/statement.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole domain suite**

Run: `bun test src/lib/domain`
Expected: PASS, four files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/statement.ts src/lib/domain/statement.test.ts
git commit -m "feat: derive statements, urgency, and the next actionable statement"
```

---

### Task 5: Repository interface, in-memory implementation, contract suite

**Files:**
- Create: `src/lib/storage/repository.ts`
- Create: `src/lib/storage/contract.ts`
- Test: `src/lib/storage/memory.test.ts`

**Interfaces:**
- Consumes: `types.ts`.
- Produces: `interface Repository` (methods exactly as in the spec), `class InMemoryRepository implements Repository`, `class StorageError extends Error`, and `repositoryContract(name: string, create: () => Repository): void` — a reusable suite of `describe`/`test` blocks that any implementation must pass.

- [ ] **Step 1: Write `src/lib/storage/repository.ts`**

The interface and the in-memory implementation are written together, because the contract suite in the next step is the test for both.

```ts
import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";

/** Thrown when the underlying store refuses a read or a write. */
export class StorageError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "StorageError";
	}
}

export interface Repository {
	listCards(): Promise<Card[]>;
	getCard(id: string): Promise<Card | null>;
	saveCard(card: Card): Promise<void>;
	deleteCard(id: string): Promise<void>;

	/** Purchases for one card, sorted by date ascending, optionally limited to `[from, to]`. */
	listPurchases(cardId: string, from?: string, to?: string): Promise<Purchase[]>;
	savePurchase(purchase: Purchase): Promise<void>;
	deletePurchase(cardId: string, id: string): Promise<void>;

	listPayments(cardId: string): Promise<StatementPayment[]>;
	savePayment(payment: StatementPayment): Promise<void>;
	deletePayment(cardId: string, period: string): Promise<void>;
}

const clone = <T>(value: T): T => structuredClone(value);

/** Reference implementation. Used by tests and as the contract's baseline. */
export class InMemoryRepository implements Repository {
	private cards = new Map<string, Card>();
	private purchases = new Map<string, Purchase>();
	private payments = new Map<string, StatementPayment>();

	async listCards(): Promise<Card[]> {
		return [...this.cards.values()].map(clone).sort((a, b) => (a.id < b.id ? -1 : 1));
	}

	async getCard(id: string): Promise<Card | null> {
		const card = this.cards.get(id);
		return card ? clone(card) : null;
	}

	async saveCard(card: Card): Promise<void> {
		this.cards.set(card.id, clone(card));
	}

	async deleteCard(id: string): Promise<void> {
		this.cards.delete(id);
	}

	async listPurchases(cardId: string, from?: string, to?: string): Promise<Purchase[]> {
		return [...this.purchases.values()]
			.filter((p) => p.cardId === cardId)
			.filter((p) => (from ? p.date >= from : true))
			.filter((p) => (to ? p.date <= to : true))
			.map(clone)
			.sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
	}

	async savePurchase(purchase: Purchase): Promise<void> {
		this.purchases.set(`${purchase.cardId}:${purchase.id}`, clone(purchase));
	}

	async deletePurchase(cardId: string, id: string): Promise<void> {
		this.purchases.delete(`${cardId}:${id}`);
	}

	async listPayments(cardId: string): Promise<StatementPayment[]> {
		return [...this.payments.values()]
			.filter((p) => p.cardId === cardId)
			.map(clone)
			.sort((a, b) => (a.period < b.period ? -1 : 1));
	}

	async savePayment(payment: StatementPayment): Promise<void> {
		this.payments.set(`${payment.cardId}:${payment.period}`, clone(payment));
	}

	async deletePayment(cardId: string, period: string): Promise<void> {
		this.payments.delete(`${cardId}:${period}`);
	}
}
```

- [ ] **Step 2: Write the contract suite in `src/lib/storage/contract.ts`**

Every implementation is held to this one suite. It is a source file rather than a test file so both `memory.test.ts` and `local.test.ts` can call it.

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";
import type { Repository } from "#lib/storage/repository.ts";

export const sampleCard = (overrides: Partial<Card> = {}): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "Krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	...overrides,
});

export const samplePurchase = (overrides: Partial<Purchase> = {}): Purchase => ({
	id: "p1",
	cardId: "kbank",
	date: "2026-09-05",
	amount: 10_000,
	note: "fuel",
	...overrides,
});

export const samplePayment = (overrides: Partial<StatementPayment> = {}): StatementPayment => ({
	cardId: "kbank",
	period: "2026-09",
	paidAt: "2026-10-01",
	closeDate: "2026-09-18",
	dueDate: "2026-10-03",
	...overrides,
});

/** Runs the behaviour every Repository implementation must have. */
export function repositoryContract(name: string, create: () => Repository): void {
	describe(`${name} repository contract`, () => {
		let repo: Repository;

		beforeEach(() => {
			repo = create();
		});

		test("returns nothing before anything is saved", async () => {
			expect(await repo.listCards()).toEqual([]);
			expect(await repo.getCard("kbank")).toBeNull();
			expect(await repo.listPurchases("kbank")).toEqual([]);
			expect(await repo.listPayments("kbank")).toEqual([]);
		});

		test("saves and reads a card back whole", async () => {
			const card = sampleCard({ comment: "company car fuel" });
			await repo.saveCard(card);
			expect(await repo.getCard("kbank")).toEqual(card);
			expect(await repo.listCards()).toEqual([card]);
		});

		test("saving the same id replaces the card", async () => {
			await repo.saveCard(sampleCard());
			await repo.saveCard(sampleCard({ location: "Bangkok" }));
			const cards = await repo.listCards();
			expect(cards).toHaveLength(1);
			expect(cards[0]?.location).toBe("Bangkok");
		});

		test("stores both cycle rule kinds", async () => {
			await repo.saveCard(sampleCard({ id: "scb", cycle: { kind: "fixed", closeDay: 18, dueDay: 5 } }));
			expect((await repo.getCard("scb"))?.cycle).toEqual({ kind: "fixed", closeDay: 18, dueDay: 5 });
		});

		test("deletes a card", async () => {
			await repo.saveCard(sampleCard());
			await repo.deleteCard("kbank");
			expect(await repo.getCard("kbank")).toBeNull();
		});

		test("lists purchases of one card only, sorted by date", async () => {
			await repo.savePurchase(samplePurchase({ id: "p2", date: "2026-09-20" }));
			await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-09-05" }));
			await repo.savePurchase(samplePurchase({ id: "p3", cardId: "scb", date: "2026-09-06" }));

			expect((await repo.listPurchases("kbank")).map((p) => p.id)).toEqual(["p1", "p2"]);
		});

		test("limits purchases to a date range, inclusive at both ends", async () => {
			await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-08-31" }));
			await repo.savePurchase(samplePurchase({ id: "p2", date: "2026-09-01" }));
			await repo.savePurchase(samplePurchase({ id: "p3", date: "2026-09-30" }));
			await repo.savePurchase(samplePurchase({ id: "p4", date: "2026-10-01" }));

			const inRange = await repo.listPurchases("kbank", "2026-09-01", "2026-09-30");
			expect(inRange.map((p) => p.id)).toEqual(["p2", "p3"]);
		});

		test("saving the same purchase id replaces it", async () => {
			await repo.savePurchase(samplePurchase({ amount: 10_000 }));
			await repo.savePurchase(samplePurchase({ amount: 25_000 }));
			const purchases = await repo.listPurchases("kbank");
			expect(purchases).toHaveLength(1);
			expect(purchases[0]?.amount).toBe(25_000);
		});

		test("deletes a purchase", async () => {
			await repo.savePurchase(samplePurchase());
			await repo.deletePurchase("kbank", "p1");
			expect(await repo.listPurchases("kbank")).toEqual([]);
		});

		test("saves, lists, and deletes payments per card", async () => {
			await repo.savePayment(samplePayment({ period: "2026-09" }));
			await repo.savePayment(samplePayment({ period: "2026-08" }));
			await repo.savePayment(samplePayment({ cardId: "scb", period: "2026-09" }));

			expect((await repo.listPayments("kbank")).map((p) => p.period)).toEqual(["2026-08", "2026-09"]);

			await repo.deletePayment("kbank", "2026-08");
			expect((await repo.listPayments("kbank")).map((p) => p.period)).toEqual(["2026-09"]);
		});

		test("deleting something absent is not an error", async () => {
			await repo.deleteCard("nope");
			await repo.deletePurchase("nope", "nope");
			await repo.deletePayment("nope", "2026-01");
		});

		test("returned objects are copies, not live references", async () => {
			await repo.saveCard(sampleCard());
			const card = await repo.getCard("kbank");
			if (card) card.name = "mutated";
			expect((await repo.getCard("kbank"))?.name).toBe("KBank Visa");
		});
	});
}
```

- [ ] **Step 3: Write `src/lib/storage/memory.test.ts`**

```ts
import { repositoryContract } from "#lib/storage/contract.ts";
import { InMemoryRepository } from "#lib/storage/repository.ts";

repositoryContract("in-memory", () => new InMemoryRepository());
```

- [ ] **Step 4: Run the contract and watch it pass**

Run: `bun test src/lib/storage/memory.test.ts`
Expected: PASS. (The interface and implementation were written together, so this suite starts green; it exists to hold the next task's implementation to the same behaviour.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/repository.ts src/lib/storage/contract.ts src/lib/storage/memory.test.ts
git commit -m "feat: add repository interface, in-memory store, and contract suite"
```

---

### Task 6: localStorage repository and factory

**Files:**
- Create: `src/lib/storage/local.ts`
- Create: `src/lib/storage/index.ts`
- Test: `src/lib/storage/local.test.ts`

**Interfaces:**
- Consumes: `repository.ts` (`Repository`, `StorageError`), `contract.ts` (`repositoryContract`).
- Produces: `class LocalStorageRepository implements Repository` (constructor takes a `Storage`), `createRepository(storage?: Storage): Repository`, `class StorageUnavailableError extends Error`.

Key shapes, matching the spec exactly:

```
cc:card:<cardId>
cc:purchase:<cardId>:<date>:<purchaseId>
cc:payment:<cardId>:<period>
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/local.test.ts`. It runs the shared contract plus the behaviour specific to this implementation.

```ts
import { describe, expect, test } from "bun:test";
import { repositoryContract, sampleCard, samplePurchase } from "#lib/storage/contract.ts";
import { LocalStorageRepository } from "#lib/storage/local.ts";
import { StorageError } from "#lib/storage/repository.ts";

const freshStorage = (): Storage => {
	localStorage.clear();
	return localStorage;
};

repositoryContract("localStorage", () => new LocalStorageRepository(freshStorage()));

describe("LocalStorageRepository key layout", () => {
	test("writes the documented key shapes", async () => {
		const repo = new LocalStorageRepository(freshStorage());
		await repo.saveCard(sampleCard());
		await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-09-05" }));

		expect(localStorage.getItem("cc:card:kbank")).not.toBeNull();
		expect(localStorage.getItem("cc:purchase:kbank:2026-09-05:p1")).not.toBeNull();
	});

	test("ignores unrelated keys in the same origin", async () => {
		const repo = new LocalStorageRepository(freshStorage());
		localStorage.setItem("some-other-app", "hello");
		expect(await repo.listCards()).toEqual([]);
	});

	test("moves the key when a purchase date is edited", async () => {
		const repo = new LocalStorageRepository(freshStorage());
		await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-09-05" }));
		await repo.deletePurchase("kbank", "p1");
		await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-09-25" }));

		const purchases = await repo.listPurchases("kbank");
		expect(purchases).toHaveLength(1);
		expect(purchases[0]?.date).toBe("2026-09-25");
	});

	test("reports corrupt JSON as a StorageError naming the key", async () => {
		const repo = new LocalStorageRepository(freshStorage());
		localStorage.setItem("cc:card:broken", "{not json");
		await expect(repo.listCards()).rejects.toThrow(StorageError);
	});

	test("reports a failing write as a StorageError", async () => {
		const failing = {
			length: 0,
			key: () => null,
			getItem: () => null,
			removeItem: () => {},
			clear: () => {},
			setItem: () => {
				throw new DOMException("quota", "QuotaExceededError");
			},
		} as unknown as Storage;

		const repo = new LocalStorageRepository(failing);
		await expect(repo.saveCard(sampleCard())).rejects.toThrow(StorageError);
	});
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/lib/storage/local.test.ts`
Expected: FAIL — `#lib/storage/local.ts` does not exist.

- [ ] **Step 3: Implement `src/lib/storage/local.ts`**

```ts
import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";
import { type Repository, StorageError } from "#lib/storage/repository.ts";

const PREFIX = "cc:";
const CARD = `${PREFIX}card:`;
const PURCHASE = `${PREFIX}purchase:`;
const PAYMENT = `${PREFIX}payment:`;

export const cardKey = (cardId: string): string => `${CARD}${cardId}`;
export const purchaseKey = (p: Purchase): string => `${PURCHASE}${p.cardId}:${p.date}:${p.id}`;
export const paymentKey = (cardId: string, period: string): string => `${PAYMENT}${cardId}:${period}`;

/** Phase 1 store. Key shapes match the Cloudflare KV layout so phase 2 is a drop-in. */
export class LocalStorageRepository implements Repository {
	constructor(private readonly storage: Storage) {}

	private read<T>(key: string): T | null {
		const raw = this.storage.getItem(key);
		if (raw === null) return null;
		try {
			return JSON.parse(raw) as T;
		} catch (cause) {
			throw new StorageError(`Stored value at ${key} is not readable`, { cause });
		}
	}

	private write(key: string, value: unknown): void {
		try {
			this.storage.setItem(key, JSON.stringify(value));
		} catch (cause) {
			throw new StorageError(`Could not save ${key}. Storage may be full or blocked.`, { cause });
		}
	}

	/** Every key under `prefix`, sorted — the localStorage equivalent of a KV prefix list. */
	private keysWithPrefix(prefix: string): string[] {
		const keys: string[] = [];
		for (let index = 0; index < this.storage.length; index += 1) {
			const key = this.storage.key(index);
			if (key?.startsWith(prefix)) keys.push(key);
		}
		return keys.sort();
	}

	private readAll<T>(prefix: string): T[] {
		return this.keysWithPrefix(prefix)
			.map((key) => this.read<T>(key))
			.filter((value): value is T => value !== null);
	}

	async listCards(): Promise<Card[]> {
		return this.readAll<Card>(CARD);
	}

	async getCard(id: string): Promise<Card | null> {
		return this.read<Card>(cardKey(id));
	}

	async saveCard(card: Card): Promise<void> {
		this.write(cardKey(card.id), card);
	}

	async deleteCard(id: string): Promise<void> {
		this.storage.removeItem(cardKey(id));
	}

	async listPurchases(cardId: string, from?: string, to?: string): Promise<Purchase[]> {
		// Keys sort by date because the date sits before the id in the key.
		return this.readAll<Purchase>(`${PURCHASE}${cardId}:`)
			.filter((p) => (from ? p.date >= from : true))
			.filter((p) => (to ? p.date <= to : true));
	}

	async savePurchase(purchase: Purchase): Promise<void> {
		this.write(purchaseKey(purchase), purchase);
	}

	async deletePurchase(cardId: string, id: string): Promise<void> {
		const suffix = `:${id}`;
		for (const key of this.keysWithPrefix(`${PURCHASE}${cardId}:`)) {
			if (key.endsWith(suffix)) this.storage.removeItem(key);
		}
	}

	async listPayments(cardId: string): Promise<StatementPayment[]> {
		return this.readAll<StatementPayment>(`${PAYMENT}${cardId}:`);
	}

	async savePayment(payment: StatementPayment): Promise<void> {
		this.write(paymentKey(payment.cardId, payment.period), payment);
	}

	async deletePayment(cardId: string, period: string): Promise<void> {
		this.storage.removeItem(paymentKey(cardId, period));
	}
}
```

Note on `savePurchase`: editing a purchase's date changes its key, so the pages always delete before saving an edited purchase. The contract test "moves the key when a purchase date is edited" pins that sequence.

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/lib/storage/local.test.ts`
Expected: PASS — the shared contract plus the five local-specific tests.

- [ ] **Step 5: Write the factory `src/lib/storage/index.ts`**

```ts
import { LocalStorageRepository } from "#lib/storage/local.ts";
import type { Repository } from "#lib/storage/repository.ts";

/** Thrown at startup when the browser gives the page no usable storage. */
export class StorageUnavailableError extends Error {
	constructor(options?: { cause?: unknown }) {
		super(
			"This browser is not letting the page store data. " +
				"Private windows and blocked site data both cause this.",
			options,
		);
		this.name = "StorageUnavailableError";
	}
}

/** Probe rather than trust: some browsers expose localStorage and throw on use. */
function assertUsable(storage: Storage): void {
	const probe = "cc:probe";
	try {
		storage.setItem(probe, "1");
		storage.removeItem(probe);
	} catch (cause) {
		throw new StorageUnavailableError({ cause });
	}
}

export function createRepository(storage: Storage | undefined = globalThis.localStorage): Repository {
	if (!storage) throw new StorageUnavailableError();
	assertUsable(storage);
	return new LocalStorageRepository(storage);
}

export { LocalStorageRepository } from "#lib/storage/local.ts";
export { InMemoryRepository, type Repository, StorageError } from "#lib/storage/repository.ts";
```

- [ ] **Step 6: Run the whole suite**

Run: `bun test`
Expected: PASS, six files.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/local.ts src/lib/storage/local.test.ts src/lib/storage/index.ts
git commit -m "feat: add localStorage repository with KV-shaped keys"
```

---

### Task 7: Backup export and import

**Files:**
- Create: `src/lib/storage/transfer.ts`
- Test: `src/lib/storage/transfer.test.ts`

**Interfaces:**
- Consumes: `repository.ts` (`Repository`, `StorageError`), `domain/types.ts`.
- Produces: `type Backup = { version: 1; exportedAt: string; cards: Card[]; purchases: Purchase[]; payments: StatementPayment[] }`, `exportBackup(repo: Repository, now?: Date): Promise<Backup>`, `parseBackup(text: string): Backup`, `importBackup(repo: Repository, backup: Backup): Promise<void>`.

`importBackup` is additive: it writes every record in the backup over whatever shares its id. It never deletes, so importing into a populated store merges rather than wipes.

- [ ] **Step 1: Write the failing test**

Create `src/lib/storage/transfer.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { sampleCard, samplePayment, samplePurchase } from "#lib/storage/contract.ts";
import { InMemoryRepository } from "#lib/storage/repository.ts";
import { exportBackup, importBackup, parseBackup } from "#lib/storage/transfer.ts";

const populated = async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(sampleCard());
	await repo.saveCard(sampleCard({ id: "scb", name: "SCB Mastercard", location: "Phichit" }));
	await repo.savePurchase(samplePurchase({ id: "p1" }));
	await repo.savePurchase(samplePurchase({ id: "p2", cardId: "scb", date: "2026-09-09" }));
	await repo.savePayment(samplePayment());
	return repo;
};

describe("exportBackup", () => {
	test("captures every card, purchase, and payment", async () => {
		const backup = await exportBackup(await populated(), new Date("2026-09-21T03:00:00Z"));

		expect(backup.version).toBe(1);
		expect(backup.exportedAt).toBe("2026-09-21T03:00:00.000Z");
		expect(backup.cards.map((c) => c.id)).toEqual(["kbank", "scb"]);
		expect(backup.purchases.map((p) => p.id)).toEqual(["p1", "p2"]);
		expect(backup.payments).toHaveLength(1);
	});

	test("exports an empty store as empty lists", async () => {
		const backup = await exportBackup(new InMemoryRepository());
		expect(backup.cards).toEqual([]);
		expect(backup.purchases).toEqual([]);
		expect(backup.payments).toEqual([]);
	});
});

describe("parseBackup", () => {
	test("accepts a backup this app wrote", async () => {
		const text = JSON.stringify(await exportBackup(await populated()));
		expect(parseBackup(text).cards).toHaveLength(2);
	});

	test("rejects malformed JSON", () => {
		expect(() => parseBackup("{nope")).toThrow(/not a readable backup/i);
	});

	test("rejects a future backup version", () => {
		expect(() => parseBackup(JSON.stringify({ version: 2, cards: [], purchases: [], payments: [] })))
			.toThrow(/version 2/i);
	});

	test("rejects JSON missing the expected lists", () => {
		expect(() => parseBackup(JSON.stringify({ version: 1 }))).toThrow(/not a readable backup/i);
	});
});

describe("importBackup", () => {
	test("restores everything into an empty repository", async () => {
		const backup = await exportBackup(await populated());
		const restored = new InMemoryRepository();
		await importBackup(restored, backup);

		expect((await restored.listCards()).map((c) => c.id)).toEqual(["kbank", "scb"]);
		expect((await restored.listPurchases("kbank")).map((p) => p.id)).toEqual(["p1"]);
		expect(await restored.listPayments("kbank")).toHaveLength(1);
	});

	test("merges over existing records rather than wiping them", async () => {
		const target = new InMemoryRepository();
		await target.saveCard(sampleCard({ id: "ktc", name: "KTC Card", location: "Bangkok" }));
		await target.saveCard(sampleCard({ name: "stale name" }));

		await importBackup(target, await exportBackup(await populated()));

		const cards = await target.listCards();
		expect(cards.map((c) => c.id)).toEqual(["kbank", "ktc", "scb"]);
		expect(cards.find((c) => c.id === "kbank")?.name).toBe("KBank Visa");
	});
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/lib/storage/transfer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/storage/transfer.ts`**

```ts
import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";
import type { Repository } from "#lib/storage/repository.ts";

export const BACKUP_VERSION = 1;

export type Backup = {
	version: typeof BACKUP_VERSION;
	exportedAt: string;
	cards: Card[];
	purchases: Purchase[];
	payments: StatementPayment[];
};

export async function exportBackup(repo: Repository, now: Date = new Date()): Promise<Backup> {
	const cards = await repo.listCards();
	const purchases: Purchase[] = [];
	const payments: StatementPayment[] = [];

	for (const card of cards) {
		purchases.push(...(await repo.listPurchases(card.id)));
		payments.push(...(await repo.listPayments(card.id)));
	}

	return { version: BACKUP_VERSION, exportedAt: now.toISOString(), cards, purchases, payments };
}

const isList = (value: unknown): value is unknown[] => Array.isArray(value);

export function parseBackup(text: string): Backup {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (cause) {
		throw new Error("That file is not a readable backup.", { cause });
	}

	const backup = value as Partial<Backup>;
	if (typeof backup?.version === "number" && backup.version > BACKUP_VERSION) {
		throw new Error(
			`That backup is version ${backup.version}, and this app reads version ${BACKUP_VERSION}.`,
		);
	}
	if (!isList(backup?.cards) || !isList(backup?.purchases) || !isList(backup?.payments)) {
		throw new Error("That file is not a readable backup.");
	}
	return backup as Backup;
}

/** Additive: writes every record over whatever shares its key, and deletes nothing. */
export async function importBackup(repo: Repository, backup: Backup): Promise<void> {
	for (const card of backup.cards) await repo.saveCard(card);
	for (const purchase of backup.purchases) await repo.savePurchase(purchase);
	for (const payment of backup.payments) await repo.savePayment(payment);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/lib/storage/transfer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/transfer.ts src/lib/storage/transfer.test.ts
git commit -m "feat: add JSON backup export and import"
```

---

### Task 8: Application shell — three pages, styling, storage bootstrap

**Files:**
- Create: `src/components/cc-error-banner.ts`
- Create: `src/lib/ui/page.ts`
- Modify: `src/routes/index.html`, `src/routes/index.ts`
- Create: `src/routes/cards.html`, `src/routes/cards.ts`
- Create: `src/routes/card.html`, `src/routes/card.ts`
- Modify: `package.json` (add the `#lib/ui/*` alias is **not** needed — `#lib/*` already covers it)
- Test: `src/components/cc-error-banner.test.ts`

**Interfaces:**
- Consumes: `storage/index.ts` (`createRepository`, `StorageUnavailableError`).
- Produces: `<cc-error-banner>` with properties `message: string` and `retryLabel: string`, emitting a `retry` `CustomEvent`; `bootstrap(render: (repo: Repository) => void): void` from `src/lib/ui/page.ts`, which creates the repository, calls `render`, and paints the error banner instead when storage is unusable.

The existing `simple-greeting` demo component is deleted in this task.

- [ ] **Step 1: Write the failing test for the error banner**

Create `src/components/cc-error-banner.test.ts`:

```ts
import { expect, test } from "bun:test";
import "#components/cc-error-banner.ts";

const mount = async (message: string) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-error-banner");
	element.setAttribute("message", message);
	document.body.append(element);
	await (element as unknown as { updateComplete: Promise<unknown> }).updateComplete;
	return element;
};

test("shows the message it was given", async () => {
	const element = await mount("Could not save the card.");
	expect(element.shadowRoot?.textContent).toContain("Could not save the card.");
});

test("emits retry when the retry button is pressed", async () => {
	const element = await mount("Could not save the card.");
	let retried = false;
	element.addEventListener("retry", () => {
		retried = true;
	});
	element.shadowRoot?.querySelector("button")?.click();
	expect(retried).toBe(true);
});

test("renders nothing without a message", async () => {
	const element = await mount("");
	expect(element.shadowRoot?.querySelector("article")).toBeNull();
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/components/cc-error-banner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/cc-error-banner.ts`**

```ts
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("cc-error-banner")
export class CcErrorBanner extends LitElement {
	static override styles = css`
		article {
			border-left: 4px solid var(--pico-del-color, #b3261e);
			padding: 0.75rem 1rem;
			margin: 0 0 1rem;
			background: var(--pico-card-background-color, #fff2f0);
		}
		p { margin: 0 0 0.5rem; }
	`;

	@property() message = "";
	@property({ attribute: "retry-label" }) retryLabel = "Try again";

	override render() {
		if (!this.message) return nothing;
		return html`
			<article role="alert">
				<p>${this.message}</p>
				<button @click=${() => this.dispatchEvent(new CustomEvent("retry"))}>
					${this.retryLabel}
				</button>
			</article>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-error-banner": CcErrorBanner;
	}
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/components/cc-error-banner.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the page bootstrap `src/lib/ui/page.ts`**

```ts
import "#components/cc-error-banner.ts";
import { createRepository, StorageUnavailableError } from "#lib/storage/index.ts";
import type { Repository } from "#lib/storage/repository.ts";

/**
 * Creates the repository once per page and hands it to the page's renderer.
 * A browser that refuses storage gets the banner instead of a half-working page.
 */
export function bootstrap(render: (repo: Repository) => void): void {
	try {
		render(createRepository());
	} catch (error) {
		const banner = document.createElement("cc-error-banner");
		banner.message =
			error instanceof StorageUnavailableError
				? error.message
				: "Something went wrong starting the page.";
		banner.retryLabel = "Reload";
		banner.addEventListener("retry", () => location.reload());
		document.querySelector("main")?.prepend(banner);
	}
}
```

- [ ] **Step 6: Write the three pages**

`src/routes/index.html` — replace its contents entirely:

```html
<!DOCTYPE html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cards — cc-tracking</title>
  <script type="module" src="./index.ts"></script>
</head>
<body>
  <nav class="container">
    <ul><li><strong>cc-tracking</strong></li></ul>
    <ul>
      <li><a href="/">Dashboard</a></li>
      <li><a href="/cards">Cards</a></li>
    </ul>
  </nav>
  <main class="container" id="page"></main>
</body>
```

`src/routes/index.ts` — replace its contents entirely (this deletes `simple-greeting`):

```ts
import "@picocss/pico/css/pico.min.css";
import { bootstrap } from "#lib/ui/page.ts";

bootstrap(() => {
	const page = document.querySelector("#page");
	if (page) page.textContent = "Dashboard ready.";
});
```

`src/routes/cards.html` — same shell, with `<title>Card registry — cc-tracking</title>` and `<script type="module" src="./cards.ts"></script>`.

`src/routes/cards.ts`:

```ts
import "@picocss/pico/css/pico.min.css";
import { bootstrap } from "#lib/ui/page.ts";

bootstrap(() => {
	const page = document.querySelector("#page");
	if (page) page.textContent = "Card registry ready.";
});
```

`src/routes/card.html` — same shell, with `<title>Card — cc-tracking</title>` and `<script type="module" src="./card.ts"></script>`.

`src/routes/card.ts`:

```ts
import "@picocss/pico/css/pico.min.css";
import { bootstrap } from "#lib/ui/page.ts";

bootstrap(() => {
	const page = document.querySelector("#page");
	const cardId = new URLSearchParams(location.search).get("id");
	if (page) page.textContent = cardId ? `Card ${cardId} ready.` : "No card selected.";
});
```

These placeholder bodies are replaced by real panels in tasks 9 to 13. They exist now so the three-route build is proven before any feature depends on it.

- [ ] **Step 7: Verify the build produces three pages**

Run: `bun run build`
Expected: the output lists `dist/index.html`, `dist/cards.html`, and `dist/card.html` plus their chunks and the bundled Pico CSS.

- [ ] **Step 8: Verify the pages in a browser**

Run: `bun run dev`
Then open `http://127.0.0.1:3000/`, `/cards`, and `/card?id=test`. Each shows the nav and its placeholder line, styled by Pico. Stop the server afterwards.

- [ ] **Step 9: Commit**

```bash
git add src/components/cc-error-banner.ts src/components/cc-error-banner.test.ts src/lib/ui/page.ts src/routes
git commit -m "feat: add three-page shell with Pico styling and storage bootstrap"
```

---

### Task 9: Card registry page

**Files:**
- Create: `src/components/cc-card-form.ts`
- Create: `src/components/cc-card-table.ts`
- Modify: `src/routes/cards.ts`
- Test: `src/components/cc-card-form.test.ts`

**Interfaces:**
- Consumes: `domain/types.ts`, `domain/cycle.ts` (`describeCycle`), `storage/repository.ts`.
- Produces: `<cc-card-form>` with properties `card: Card | null` (null means create) and `locations: string[]`, emitting `save` (`CustomEvent<Card>`) and `cancel`; `<cc-card-table>` with properties `cards: Card[]` and `purchaseCounts: Record<string, number>`, emitting `edit`, `archive`, and `remove` (each `CustomEvent<string>` carrying the card id).

Form rules:

- `id` is editable only while creating; editing shows it as read-only text.
- `last4` must be exactly four digits.
- The cycle kind is a radio pair; choosing `offset` shows a "due N days after closing" field, choosing `fixed` shows a "due day of month" field.
- `closeDay`, `dueDay` are 1–31; `dueOffsetDays` is 1–60.

- [ ] **Step 1: Write the failing test**

Create `src/components/cc-card-form.test.ts`:

```ts
import { expect, test } from "bun:test";
import "#components/cc-card-form.ts";
import type { Card } from "#lib/domain/types.ts";

const mount = async (card: Card | null = null) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-card-form");
	element.card = card;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const fill = (element: HTMLElement, name: string, value: string) => {
	const field = element.shadowRoot?.querySelector<HTMLInputElement>(`[name="${name}"]`);
	if (!field) throw new Error(`no field named ${name}`);
	field.value = value;
	field.dispatchEvent(new Event("input", { bubbles: true }));
};

const submit = (element: HTMLElement) =>
	element.shadowRoot?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

test("emits a complete card with an offset rule", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "4821");
	fill(element, "location", "Krabi");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
	submit(element);

	expect(saved).toEqual({
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "Krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		comment: "",
		archived: false,
	});
});

test("emits a fixed rule when that kind is chosen", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	const fixedRadio = element.shadowRoot?.querySelector<HTMLInputElement>('[name="kind"][value="fixed"]');
	fixedRadio?.click();
	await element.updateComplete;

	fill(element, "id", "scb");
	fill(element, "name", "SCB Mastercard");
	fill(element, "last4", "1234");
	fill(element, "location", "Bangkok");
	fill(element, "closeDay", "18");
	fill(element, "dueDay", "5");
	submit(element);

	expect(saved?.cycle).toEqual({ kind: "fixed", closeDay: 18, dueDay: 5 });
});

test("refuses a last4 that is not four digits", async () => {
	const element = await mount();
	let saved = false;
	element.addEventListener("save", () => {
		saved = true;
	});

	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "48");
	fill(element, "location", "Krabi");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
	submit(element);

	expect(saved).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("four digits");
});

test("locks the id when editing an existing card", async () => {
	const element = await mount({
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "Krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
	});
	expect(element.shadowRoot?.querySelector('[name="id"]')).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("kbank");
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/components/cc-card-form.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/cc-card-form.ts`**

```ts
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Card, CycleRule } from "#lib/domain/types.ts";

@customElement("cc-card-form")
export class CcCardForm extends LitElement {
	// Pico styles the light DOM, so this component renders without shadow styles of its own.
	@property({ attribute: false }) card: Card | null = null;
	@property({ attribute: false }) locations: string[] = [];

	@state() private kind: CycleRule["kind"] = "offset";
	@state() private error = "";

	override willUpdate(changed: Map<string, unknown>) {
		if (changed.has("card") && this.card) this.kind = this.card.cycle.kind;
	}

	private value(name: string): string {
		return this.renderRoot.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value.trim() ?? "";
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		const id = this.card ? this.card.id : this.value("id");
		const last4 = this.value("last4");
		const closeDay = Number(this.value("closeDay"));

		if (!id) return this.fail("Give the card an id you will recognise.");
		if (!this.value("name")) return this.fail("Give the card a name.");
		if (!/^\d{4}$/.test(last4)) return this.fail("Last 4 must be exactly four digits.");
		if (!Number.isInteger(closeDay) || closeDay < 1 || closeDay > 31) {
			return this.fail("Closing day must be between 1 and 31.");
		}

		let cycle: CycleRule;
		if (this.kind === "offset") {
			const dueOffsetDays = Number(this.value("dueOffsetDays"));
			if (!Number.isInteger(dueOffsetDays) || dueOffsetDays < 1 || dueOffsetDays > 60) {
				return this.fail("Days until due must be between 1 and 60.");
			}
			cycle = { kind: "offset", closeDay, dueOffsetDays };
		} else {
			const dueDay = Number(this.value("dueDay"));
			if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
				return this.fail("Due day must be between 1 and 31.");
			}
			cycle = { kind: "fixed", closeDay, dueDay };
		}

		this.error = "";
		const card: Card = {
			id,
			name: this.value("name"),
			last4,
			location: this.value("location"),
			cycle,
			comment: this.value("comment"),
			archived: this.card?.archived ?? false,
		};
		this.dispatchEvent(new CustomEvent<Card>("save", { detail: card }));
	}

	private fail(message: string) {
		this.error = message;
	}

	override render() {
		const card = this.card;
		const rule = card?.cycle;
		return html`
			<form @submit=${this.onSubmit}>
				${this.error ? html`<p role="alert"><mark>${this.error}</mark></p>` : nothing}

				${card
					? html`<p>Id <strong>${card.id}</strong> <small>(cannot change)</small></p>`
					: html`<label>Id <input name="id" placeholder="kbank-visa" required /></label>`}

				<label>Name <input name="name" .value=${card?.name ?? ""} required /></label>
				<label>Last 4 <input name="last4" inputmode="numeric" .value=${card?.last4 ?? ""} required /></label>
				<label>
					Location
					<input name="location" list="cc-locations" .value=${card?.location ?? ""} required />
					<datalist id="cc-locations">
						${this.locations.map((value) => html`<option value=${value}></option>`)}
					</datalist>
				</label>

				<fieldset>
					<legend>Billing cycle</legend>
					<label>
						<input type="radio" name="kind" value="offset"
							.checked=${this.kind === "offset"}
							@change=${() => { this.kind = "offset"; }} />
						Due a number of days after closing
					</label>
					<label>
						<input type="radio" name="kind" value="fixed"
							.checked=${this.kind === "fixed"}
							@change=${() => { this.kind = "fixed"; }} />
						Due on a fixed day of the month
					</label>
				</fieldset>

				<label>Closing day <input name="closeDay" type="number" min="1" max="31"
					.value=${String(rule?.closeDay ?? "")} required /></label>

				${this.kind === "offset"
					? html`<label>Days until due <input name="dueOffsetDays" type="number" min="1" max="60"
							.value=${String(rule?.kind === "offset" ? rule.dueOffsetDays : "")} required /></label>`
					: html`<label>Due day <input name="dueDay" type="number" min="1" max="31"
							.value=${String(rule?.kind === "fixed" ? rule.dueDay : "")} required /></label>`}

				<label>Comment <input name="comment" .value=${card?.comment ?? ""} /></label>

				<button type="submit">${card ? "Save changes" : "Add card"}</button>
				<button type="button" class="secondary"
					@click=${() => this.dispatchEvent(new CustomEvent("cancel"))}>Cancel</button>
			</form>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-card-form": CcCardForm;
	}
}
```

Note: this component keeps its shadow root (Lit's default) but relies on plain semantic markup; the test queries `shadowRoot`, matching that choice.

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/components/cc-card-form.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/components/cc-card-table.ts`**

```ts
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { describeCycle } from "#lib/domain/cycle.ts";
import type { Card } from "#lib/domain/types.ts";

@customElement("cc-card-table")
export class CcCardTable extends LitElement {
	@property({ attribute: false }) cards: Card[] = [];
	@property({ attribute: false }) purchaseCounts: Record<string, number> = {};

	private emit(name: "edit" | "archive" | "remove", id: string) {
		this.dispatchEvent(new CustomEvent<string>(name, { detail: id }));
	}

	override render() {
		if (this.cards.length === 0) {
			return html`<p>No cards yet. Add the first one with the form above.</p>`;
		}
		return html`
			<table>
				<thead>
					<tr><th>Id</th><th>Name</th><th>Last 4</th><th>Location</th><th>Cycle</th><th>Comment</th><th></th></tr>
				</thead>
				<tbody>
					${this.cards.map((card) => {
						const count = this.purchaseCounts[card.id] ?? 0;
						return html`
							<tr>
								<td><a href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.id}</a></td>
								<td>${card.name}${card.archived ? html` <small>(archived)</small>` : ""}</td>
								<td>••••${card.last4}</td>
								<td>${card.location}</td>
								<td>${describeCycle(card.cycle)}</td>
								<td>${card.comment ?? ""}</td>
								<td>
									<button @click=${() => this.emit("edit", card.id)}>Edit</button>
									<button class="secondary" @click=${() => this.emit("archive", card.id)}>
										${card.archived ? "Unarchive" : "Archive"}
									</button>
									${count === 0
										? html`<button class="secondary outline"
												@click=${() => this.emit("remove", card.id)}>Delete</button>`
										: html`<small>${count} purchases</small>`}
								</td>
							</tr>
						`;
					})}
				</tbody>
			</table>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-card-table": CcCardTable;
	}
}
```

- [ ] **Step 6: Wire the page in `src/routes/cards.ts`**

```ts
import "@picocss/pico/css/pico.min.css";
import "#components/cc-card-form.ts";
import "#components/cc-card-table.ts";
import "#components/cc-error-banner.ts";
import { html, render } from "lit";
import type { Card } from "#lib/domain/types.ts";
import type { Repository } from "#lib/storage/repository.ts";
import { bootstrap } from "#lib/ui/page.ts";

bootstrap((repo) => {
	const root = document.querySelector("#page");
	if (!root) return;

	let cards: Card[] = [];
	let counts: Record<string, number> = {};
	let editing: Card | null = null;
	let error = "";

	const load = async () => {
		try {
			cards = await repo.listCards();
			counts = Object.fromEntries(
				await Promise.all(
					cards.map(async (card) => [card.id, (await repo.listPurchases(card.id)).length] as const),
				),
			);
			error = "";
		} catch (failure) {
			error = failure instanceof Error ? failure.message : "Could not read the card list.";
		}
		paint();
	};

	const guard = async (action: () => Promise<void>, message: string) => {
		try {
			await action();
			error = "";
		} catch (failure) {
			error = failure instanceof Error ? `${message} ${failure.message}` : message;
		}
		await load();
	};

	const onSave = (event: CustomEvent<Card>) =>
		guard(async () => {
			await repo.saveCard(event.detail);
			editing = null;
		}, "Could not save the card.");

	const onRemove = (event: CustomEvent<string>) =>
		guard(() => repo.deleteCard(event.detail), "Could not delete the card.");

	const onArchive = (event: CustomEvent<string>) =>
		guard(async () => {
			const card = cards.find((c) => c.id === event.detail);
			if (card) await repo.saveCard({ ...card, archived: !card.archived });
		}, "Could not archive the card.");

	const onEdit = (event: CustomEvent<string>) => {
		editing = cards.find((c) => c.id === event.detail) ?? null;
		paint();
	};

	const paint = () =>
		render(
			html`
				<h1>Cards</h1>
				<cc-error-banner .message=${error} retry-label="Reload" @retry=${load}></cc-error-banner>
				<article>
					<h2>${editing ? `Edit ${editing.name}` : "Add a card"}</h2>
					<cc-card-form
						.card=${editing}
						.locations=${[...new Set(cards.map((c) => c.location))].sort()}
						@save=${onSave}
						@cancel=${() => {
							editing = null;
							paint();
						}}
					></cc-card-form>
				</article>
				<cc-card-table
					.cards=${cards}
					.purchaseCounts=${counts}
					@edit=${onEdit}
					@archive=${onArchive}
					@remove=${onRemove}
				></cc-card-table>
			`,
			root,
		);

	void load();
});
```

- [ ] **Step 7: Run the suite and the page**

Run: `bun test`
Expected: PASS.

Run: `bun run dev`, open `http://127.0.0.1:3000/cards`, and add a card with each cycle kind, edit one, archive one, and delete one. Confirm the table updates each time and that a reload keeps the data.

- [ ] **Step 8: Commit**

```bash
git add src/components/cc-card-form.ts src/components/cc-card-form.test.ts src/components/cc-card-table.ts src/routes/cards.ts
git commit -m "feat: add card registry page with create, edit, archive, delete"
```

---

### Task 10: Dashboard — due next panel

**Files:**
- Create: `src/components/cc-due-list.ts`
- Modify: `src/routes/index.ts`
- Test: `src/components/cc-due-list.test.ts`

**Interfaces:**
- Consumes: `domain/statement.ts` (`Statement`, `Urgency`, `urgencyOf`), `domain/money.ts` (`formatAmount`), `domain/date.ts` (`displayDate`, `daysBetween`), `domain/types.ts`.
- Produces: `<cc-due-list>` with properties `rows: DueRow[]` and `today: PlainDate`, emitting `mark-paid` (`CustomEvent<{ cardId: string; period: string }>`); and `export type DueRow = { card: Card; statement: Statement }`.

- [ ] **Step 1: Write the failing test**

Create `src/components/cc-due-list.test.ts`:

```ts
import { expect, test } from "bun:test";
import "#components/cc-due-list.ts";
import type { DueRow } from "#components/cc-due-list.ts";
import { buildStatement } from "#lib/domain/statement.ts";
import type { Card, Purchase } from "#lib/domain/types.ts";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "Krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const purchases: Purchase[] = [
	{ id: "a", cardId: "kbank", date: "2026-09-05", amount: 35_000, note: "fuel" },
];

const mount = async (rows: DueRow[], today: string) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-due-list");
	element.rows = rows;
	element.today = today;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("shows the card, its total, and both dates", async () => {
	const element = await mount([{ card, statement: buildStatement(card, "2026-09", purchases) }], "2026-09-25");
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("KBank Visa");
	expect(text).toContain("4821");
	expect(text).toContain("Krabi");
	expect(text).toContain("฿350.00");
	expect(text).toContain("18 Sep 2026");
	expect(text).toContain("3 Oct 2026");
});

test("marks an overdue statement", async () => {
	const element = await mount([{ card, statement: buildStatement(card, "2026-09", purchases) }], "2026-10-10");
	expect(element.shadowRoot?.querySelector("[data-urgency='overdue']")).not.toBeNull();
});

test("emits mark-paid with the card and period", async () => {
	const element = await mount([{ card, statement: buildStatement(card, "2026-09", purchases) }], "2026-09-25");
	let detail: { cardId: string; period: string } | undefined;
	element.addEventListener("mark-paid", (event) => {
		detail = (event as CustomEvent<{ cardId: string; period: string }>).detail;
	});
	element.shadowRoot?.querySelector<HTMLButtonElement>("button")?.click();
	expect(detail).toEqual({ cardId: "kbank", period: "2026-09" });
});

test("says so when there is nothing to pay", async () => {
	const element = await mount([], "2026-09-25");
	expect(element.shadowRoot?.textContent).toContain("No cards yet");
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/components/cc-due-list.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/cc-due-list.ts`**

```ts
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { daysBetween, displayDate } from "#lib/domain/date.ts";
import { formatAmount } from "#lib/domain/money.ts";
import { urgencyOf } from "#lib/domain/statement.ts";
import type { Card, PlainDate, Statement } from "#lib/domain/types.ts";

export type DueRow = { card: Card; statement: Statement };

@customElement("cc-due-list")
export class CcDueList extends LitElement {
	static override styles = css`
		table { width: 100%; border-collapse: collapse; }
		td, th { padding: 0.5rem; border-bottom: 1px solid #ddd; text-align: left; }
		[data-urgency="overdue"] { border-left: 4px solid #b3261e; }
		[data-urgency="soon"] { border-left: 4px solid #b26a00; }
		[data-urgency="open"], [data-urgency="future"] { border-left: 4px solid transparent; }
		small { color: #666; }
	`;

	@property({ attribute: false }) rows: DueRow[] = [];
	@property() today: PlainDate = "";

	private when(statement: Statement): string {
		const remaining = daysBetween(this.today, statement.dueDate);
		if (remaining < 0) return `${Math.abs(remaining)} days overdue`;
		if (remaining === 0) return "due today";
		return `in ${remaining} days`;
	}

	override render() {
		if (this.rows.length === 0) {
			return html`<p>No cards yet. Add one on the <a href="/cards">Cards</a> page.</p>`;
		}
		const sorted = [...this.rows].sort((a, b) =>
			a.statement.dueDate < b.statement.dueDate ? -1 : a.statement.dueDate > b.statement.dueDate ? 1 : 0,
		);
		return html`
			<table>
				<thead>
					<tr><th>Card</th><th>Where</th><th>Closes</th><th>Due</th><th>Total</th><th></th></tr>
				</thead>
				<tbody>
					${sorted.map(({ card, statement }) => {
						const urgency = urgencyOf(statement, this.today);
						return html`
							<tr data-urgency=${urgency}>
								<td>
									<a href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.name}</a>
									<br /><small>••••${card.last4}</small>
								</td>
								<td>${card.location}</td>
								<td>${displayDate(statement.closeDate)}</td>
								<td>${displayDate(statement.dueDate)}<br /><small>${this.when(statement)}</small></td>
								<td>${formatAmount(statement.total)}</td>
								<td>
									${urgency === "future"
										? html`<small>still open</small>`
										: html`<button @click=${() =>
												this.dispatchEvent(
													new CustomEvent("mark-paid", {
														detail: { cardId: card.id, period: statement.period },
													}),
												)}>Mark paid</button>`}
								</td>
							</tr>
						`;
					})}
				</tbody>
			</table>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-due-list": CcDueList;
	}
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/components/cc-due-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the panel into `src/routes/index.ts`**

Replace the placeholder body written in Task 8:

```ts
import "@picocss/pico/css/pico.min.css";
import "#components/cc-due-list.ts";
import "#components/cc-error-banner.ts";
import { html, render } from "lit";
import type { DueRow } from "#components/cc-due-list.ts";
import { today } from "#lib/domain/date.ts";
import { nextActionable } from "#lib/domain/statement.ts";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";
import { bootstrap } from "#lib/ui/page.ts";

bootstrap((repo) => {
	const root = document.querySelector("#page");
	if (!root) return;

	const now = today();
	let cards: Card[] = [];
	let purchases: Purchase[] = [];
	let payments: StatementPayment[] = [];
	let error = "";

	const load = async () => {
		try {
			cards = (await repo.listCards()).filter((card) => !card.archived);
			purchases = (await Promise.all(cards.map((card) => repo.listPurchases(card.id)))).flat();
			payments = (await Promise.all(cards.map((card) => repo.listPayments(card.id)))).flat();
			error = "";
		} catch (failure) {
			error = failure instanceof Error ? failure.message : "Could not read your cards.";
		}
		paint();
	};

	const onMarkPaid = async (event: CustomEvent<{ cardId: string; period: string }>) => {
		const { cardId, period } = event.detail;
		const card = cards.find((c) => c.id === cardId);
		if (!card) return;
		const statement = nextActionable(card, purchases, payments, now);
		try {
			await repo.savePayment({
				cardId,
				period,
				paidAt: now,
				closeDate: statement.closeDate,
				dueDate: statement.dueDate,
			});
		} catch (failure) {
			error = failure instanceof Error ? failure.message : "Could not record the payment.";
		}
		await load();
	};

	const rows = (): DueRow[] =>
		cards.map((card) => ({ card, statement: nextActionable(card, purchases, payments, now) }));

	const paint = () =>
		render(
			html`
				<h1>Dashboard</h1>
				<cc-error-banner .message=${error} retry-label="Reload" @retry=${load}></cc-error-banner>
				<article>
					<h2>Due next</h2>
					<cc-due-list .rows=${rows()} .today=${now} @mark-paid=${onMarkPaid}></cc-due-list>
				</article>
			`,
			root,
		);

	void load();
});
```

- [ ] **Step 6: Verify in the browser**

Run: `bun run dev`, open `http://127.0.0.1:3000/`. With the cards added in Task 9 the panel lists one row per card with its close and due dates. Marking one paid moves the row to the next period.

- [ ] **Step 7: Commit**

```bash
git add src/components/cc-due-list.ts src/components/cc-due-list.test.ts src/routes/index.ts
git commit -m "feat: add dashboard due-next panel with mark paid"
```

---

### Task 11: Dashboard — quick add purchase

**Files:**
- Create: `src/components/cc-quick-add.ts`
- Modify: `src/routes/index.ts`
- Test: `src/components/cc-quick-add.test.ts`

**Interfaces:**
- Consumes: `domain/money.ts` (`parseAmount`), `domain/date.ts` (`isValidDate`, `displayDate`), `domain/cycle.ts` (`periodOfPurchase`, `closeDateOf`, `dueDateOf`), `domain/types.ts`.
- Produces: `<cc-quick-add>` with properties `cards: Card[]`, `today: PlainDate`, and `answer: string`, emitting `add` (`CustomEvent<{ cardId: string; date: PlainDate; amount: number; note: string }>`).

The component validates and emits; the page saves and then sets `answer` to the sentence describing where the purchase landed.

- [ ] **Step 1: Write the failing test**

Create `src/components/cc-quick-add.test.ts`:

```ts
import { expect, test } from "bun:test";
import "#components/cc-quick-add.ts";
import type { Card } from "#lib/domain/types.ts";

const cards: Card[] = [
	{
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "Krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
	},
];

const mount = async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-quick-add");
	element.cards = cards;
	element.today = "2026-09-21";
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const fill = (element: HTMLElement, name: string, value: string) => {
	const field = element.shadowRoot?.querySelector<HTMLInputElement>(`[name="${name}"]`);
	if (!field) throw new Error(`no field named ${name}`);
	field.value = value;
	field.dispatchEvent(new Event("input", { bubbles: true }));
};

const submit = (element: HTMLElement) =>
	element.shadowRoot?.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

test("defaults the date to today", async () => {
	const element = await mount();
	const date = element.shadowRoot?.querySelector<HTMLInputElement>('[name="date"]');
	expect(date?.value).toBe("2026-09-21");
});

test("emits the purchase in satang", async () => {
	const element = await mount();
	let detail: { cardId: string; date: string; amount: number; note: string } | undefined;
	element.addEventListener("add", (event) => {
		detail = (event as CustomEvent<typeof detail>).detail;
	});

	fill(element, "amount", "1,234.56");
	fill(element, "note", "office supplies");
	submit(element);

	expect(detail).toEqual({
		cardId: "kbank",
		date: "2026-09-21",
		amount: 123_456,
		note: "office supplies",
	});
});

test("refuses an invalid amount and says why", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("add", () => {
		emitted = true;
	});

	fill(element, "amount", "free");
	submit(element);

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("amount");
});

test("refuses an impossible date", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("add", () => {
		emitted = true;
	});

	fill(element, "date", "2026-02-30");
	fill(element, "amount", "100");
	submit(element);

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("date");
});

test("shows the answer the page gives it", async () => {
	const element = await mount();
	element.answer = "Lands on the statement closing 18 Sep 2026 — pay by 3 Oct 2026.";
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("pay by 3 Oct 2026");
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/components/cc-quick-add.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/cc-quick-add.ts`**

```ts
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { isValidDate } from "#lib/domain/date.ts";
import { parseAmount } from "#lib/domain/money.ts";
import type { Card, PlainDate } from "#lib/domain/types.ts";

export type QuickAddDetail = {
	cardId: string;
	date: PlainDate;
	amount: number;
	note: string;
};

@customElement("cc-quick-add")
export class CcQuickAdd extends LitElement {
	@property({ attribute: false }) cards: Card[] = [];
	@property() today: PlainDate = "";
	/** Set by the page after a successful save. */
	@property() answer = "";

	@state() private error = "";

	private value(name: string): string {
		return this.renderRoot.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value.trim() ?? "";
	}

	private onSubmit(event: Event) {
		event.preventDefault();
		const cardId = this.value("cardId");
		const date = this.value("date");
		if (!cardId) {
			this.error = "Choose a card first.";
			return;
		}
		if (!isValidDate(date)) {
			this.error = "That date does not exist. Use YYYY-MM-DD.";
			return;
		}
		let amount: number;
		try {
			amount = parseAmount(this.value("amount"));
		} catch {
			this.error = "Enter the amount in baht, like 1234.56.";
			return;
		}
		this.error = "";
		this.dispatchEvent(
			new CustomEvent<QuickAddDetail>("add", {
				detail: { cardId, date, amount, note: this.value("note") },
			}),
		);
		this.renderRoot.querySelector("form")?.reset();
	}

	override render() {
		return html`
			<form @submit=${this.onSubmit}>
				${this.error ? html`<p role="alert"><mark>${this.error}</mark></p>` : nothing}
				<label>
					Card
					<select name="cardId" required>
						${this.cards.map(
							(card) => html`<option value=${card.id}>${card.name} ••••${card.last4}</option>`,
						)}
					</select>
				</label>
				<label>Date <input name="date" type="date" .value=${this.today} required /></label>
				<label>Amount (THB) <input name="amount" inputmode="decimal" placeholder="1234.56" required /></label>
				<label>Note <input name="note" placeholder="office supplies" /></label>
				<button type="submit">Add purchase</button>
				${this.answer ? html`<p><ins>${this.answer}</ins></p>` : nothing}
			</form>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-quick-add": CcQuickAdd;
	}
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/components/cc-quick-add.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the panel into `src/routes/index.ts`**

Add these imports at the top of the file:

```ts
import "#components/cc-quick-add.ts";
import type { QuickAddDetail } from "#components/cc-quick-add.ts";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle.ts";
import { displayDate } from "#lib/domain/date.ts";
```

Add the answer state beside the existing `error` variable:

```ts
let answer = "";
```

Add the handler beside `onMarkPaid`:

```ts
const onAdd = async (event: CustomEvent<QuickAddDetail>) => {
	const { cardId, date, amount, note } = event.detail;
	const card = cards.find((c) => c.id === cardId);
	if (!card) return;
	try {
		await repo.savePurchase({ id: crypto.randomUUID(), cardId, date, amount, note });
		const period = periodOfPurchase(card.cycle, date);
		answer =
			`Lands on the statement closing ${displayDate(closeDateOf(card.cycle, period))}` +
			` — pay by ${displayDate(dueDateOf(card.cycle, period))}.`;
	} catch (failure) {
		error = failure instanceof Error ? failure.message : "Could not save the purchase.";
	}
	await load();
};
```

Add the panel to `paint()`, after the due-next article:

```ts
<article>
	<h2>Add a purchase</h2>
	<cc-quick-add .cards=${cards} .today=${now} .answer=${answer} @add=${onAdd}></cc-quick-add>
</article>
```

- [ ] **Step 6: Verify in the browser**

Run: `bun run dev`, open `http://127.0.0.1:3000/`. Add a purchase dated before a card's closing day and one dated after it; the answer line names a different due date for each, and the due-next panel's total changes.

- [ ] **Step 7: Commit**

```bash
git add src/components/cc-quick-add.ts src/components/cc-quick-add.test.ts src/routes/index.ts
git commit -m "feat: add quick purchase entry that answers when payment is due"
```

---

### Task 12: Dashboard — cards by location

**Files:**
- Create: `src/components/cc-location-groups.ts`
- Modify: `src/routes/index.ts`
- Test: `src/components/cc-location-groups.test.ts`

**Interfaces:**
- Consumes: `domain/date.ts` (`displayDate`), `domain/types.ts`, and `DueRow` from `#components/cc-due-list.ts`.
- Produces: `<cc-location-groups>` with property `rows: DueRow[]`, rendered inside a collapsed `<details>`.

- [ ] **Step 1: Write the failing test**

Create `src/components/cc-location-groups.test.ts`:

```ts
import { expect, test } from "bun:test";
import "#components/cc-location-groups.ts";
import type { DueRow } from "#components/cc-due-list.ts";
import { buildStatement } from "#lib/domain/statement.ts";
import type { Card } from "#lib/domain/types.ts";

const card = (id: string, location: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "0000",
	location,
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
});

const rowsFor = (...cards: Card[]): DueRow[] =>
	cards.map((c) => ({ card: c, statement: buildStatement(c, "2026-09", []) }));

const mount = async (rows: DueRow[]) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-location-groups");
	element.rows = rows;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("groups cards by location and counts them", async () => {
	const element = await mount(
		rowsFor(card("a", "Krabi"), card("b", "Krabi"), card("c", "Bangkok")),
	);
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("Bangkok (1)");
	expect(text).toContain("Krabi (2)");
});

test("names the soonest due date in each group", async () => {
	const element = await mount(rowsFor(card("a", "Krabi")));
	expect(element.shadowRoot?.textContent).toContain("3 Oct 2026");
});

test("starts collapsed", async () => {
	const element = await mount(rowsFor(card("a", "Krabi")));
	expect(element.shadowRoot?.querySelector("details")?.hasAttribute("open")).toBe(false);
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/components/cc-location-groups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/cc-location-groups.ts`**

```ts
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { DueRow } from "#components/cc-due-list.ts";
import { displayDate } from "#lib/domain/date.ts";

@customElement("cc-location-groups")
export class CcLocationGroups extends LitElement {
	@property({ attribute: false }) rows: DueRow[] = [];

	private grouped(): [string, DueRow[]][] {
		const groups = new Map<string, DueRow[]>();
		for (const row of this.rows) {
			const location = row.card.location || "Unknown";
			groups.set(location, [...(groups.get(location) ?? []), row]);
		}
		return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
	}

	override render() {
		return html`
			<details>
				<summary>Cards by location</summary>
				${this.grouped().map(([location, rows]) => {
					const soonest = rows
						.map((row) => row.statement.dueDate)
						.sort()[0];
					return html`
						<article>
							<h3>${location} (${rows.length})</h3>
							<p><small>Next due ${soonest ? displayDate(soonest) : "—"}</small></p>
							<ul>
								${rows.map(
									({ card }) => html`
										<li>
											<a href=${`/card?id=${encodeURIComponent(card.id)}`}>${card.name}</a>
											••••${card.last4}
										</li>
									`,
								)}
							</ul>
						</article>
					`;
				})}
			</details>
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-location-groups": CcLocationGroups;
	}
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/components/cc-location-groups.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the panel into `src/routes/index.ts`**

Add the import at the top:

```ts
import "#components/cc-location-groups.ts";
```

Add the panel to `paint()`, after the quick-add article:

```ts
<article>
	<cc-location-groups .rows=${rows()}></cc-location-groups>
</article>
```

- [ ] **Step 6: Verify in the browser**

Run: `bun run dev`, open `http://127.0.0.1:3000/`, expand "Cards by location", and confirm each of Krabi, Phichit, and Bangkok lists the right cards.

- [ ] **Step 7: Commit**

```bash
git add src/components/cc-location-groups.ts src/components/cc-location-groups.test.ts src/routes/index.ts
git commit -m "feat: group dashboard cards by location"
```

---

### Task 13: Card detail page

**Files:**
- Create: `src/components/cc-statement-list.ts`
- Modify: `src/routes/card.ts`
- Test: `src/components/cc-statement-list.test.ts`

**Interfaces:**
- Consumes: `domain/statement.ts`, `domain/money.ts`, `domain/date.ts`, `domain/types.ts`.
- Produces: `<cc-statement-list>` with properties `statements: Statement[]` and `today: PlainDate`, emitting `mark-paid` and `unmark-paid` (both `CustomEvent<{ cardId: string; period: string }>`) and `delete-purchase` (`CustomEvent<{ cardId: string; purchaseId: string }>`).

The page owns paging: it starts with 12 periods and adds 12 more each time "Show older" is pressed.

- [ ] **Step 1: Write the failing test**

Create `src/components/cc-statement-list.test.ts`:

```ts
import { expect, test } from "bun:test";
import "#components/cc-statement-list.ts";
import { buildStatement } from "#lib/domain/statement.ts";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "Krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const purchases: Purchase[] = [
	{ id: "a", cardId: "kbank", date: "2026-09-05", amount: 10_000, note: "fuel" },
	{ id: "b", cardId: "kbank", date: "2026-09-18", amount: 25_000, note: "parts" },
];

const payment: StatementPayment = {
	cardId: "kbank",
	period: "2026-08",
	paidAt: "2026-09-01",
	closeDate: "2026-08-18",
	dueDate: "2026-09-02",
};

const mount = async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-statement-list");
	element.statements = [
		buildStatement(card, "2026-09", purchases),
		buildStatement(card, "2026-08", purchases, payment),
	];
	element.today = "2026-09-25";
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("lists each statement with its dates, purchases, and total", async () => {
	const element = await mount();
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("18 Sep 2026");
	expect(text).toContain("3 Oct 2026");
	expect(text).toContain("fuel");
	expect(text).toContain("฿350.00");
});

test("shows a paid statement as paid, with its payment date", async () => {
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Paid 1 Sep 2026");
});

test("emits mark-paid for an unpaid statement", async () => {
	const element = await mount();
	let detail: { cardId: string; period: string } | undefined;
	element.addEventListener("mark-paid", (event) => {
		detail = (event as CustomEvent<{ cardId: string; period: string }>).detail;
	});
	element.shadowRoot?.querySelector<HTMLButtonElement>("[data-action='mark-paid']")?.click();
	expect(detail).toEqual({ cardId: "kbank", period: "2026-09" });
});

test("emits unmark-paid for a paid statement", async () => {
	const element = await mount();
	let detail: { cardId: string; period: string } | undefined;
	element.addEventListener("unmark-paid", (event) => {
		detail = (event as CustomEvent<{ cardId: string; period: string }>).detail;
	});
	element.shadowRoot?.querySelector<HTMLButtonElement>("[data-action='unmark-paid']")?.click();
	expect(detail).toEqual({ cardId: "kbank", period: "2026-08" });
});

test("emits delete-purchase with the purchase id", async () => {
	const element = await mount();
	let detail: { cardId: string; purchaseId: string } | undefined;
	element.addEventListener("delete-purchase", (event) => {
		detail = (event as CustomEvent<{ cardId: string; purchaseId: string }>).detail;
	});
	element.shadowRoot?.querySelector<HTMLButtonElement>("[data-action='delete-purchase']")?.click();
	expect(detail).toEqual({ cardId: "kbank", purchaseId: "a" });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/components/cc-statement-list.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/cc-statement-list.ts`**

```ts
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { displayDate } from "#lib/domain/date.ts";
import { formatAmount } from "#lib/domain/money.ts";
import { urgencyOf } from "#lib/domain/statement.ts";
import type { PlainDate, Statement } from "#lib/domain/types.ts";

@customElement("cc-statement-list")
export class CcStatementList extends LitElement {
	@property({ attribute: false }) statements: Statement[] = [];
	@property() today: PlainDate = "";

	private emit(name: string, detail: Record<string, string>) {
		this.dispatchEvent(new CustomEvent(name, { detail }));
	}

	override render() {
		if (this.statements.length === 0) {
			return html`<p>No statements yet. Add a purchase from the dashboard.</p>`;
		}
		return html`
			${this.statements.map(
				(statement) => html`
					<article data-urgency=${urgencyOf(statement, this.today)}>
						<header>
							<strong>${statement.period}</strong>
							— closes ${displayDate(statement.closeDate)},
							due ${displayDate(statement.dueDate)}
							<br />
							${statement.paid && statement.payment
								? html`<small>Paid ${displayDate(statement.payment.paidAt)}</small>
										<button data-action="unmark-paid" class="secondary"
											@click=${() =>
												this.emit("unmark-paid", {
													cardId: statement.cardId,
													period: statement.period,
												})}>Unmark</button>`
								: html`<button data-action="mark-paid"
										@click=${() =>
											this.emit("mark-paid", {
												cardId: statement.cardId,
												period: statement.period,
											})}>Mark paid</button>`}
						</header>

						${statement.purchases.length === 0
							? html`<p><small>No purchases in this period.</small></p>`
							: html`
									<table>
										<tbody>
											${statement.purchases.map(
												(purchase) => html`
													<tr>
														<td>${displayDate(purchase.date)}</td>
														<td>${purchase.note}</td>
														<td>${formatAmount(purchase.amount)}</td>
														<td>
															<button data-action="delete-purchase" class="secondary outline"
																@click=${() =>
																	this.emit("delete-purchase", {
																		cardId: purchase.cardId,
																		purchaseId: purchase.id,
																	})}>Delete</button>
														</td>
													</tr>
												`,
											)}
										</tbody>
									</table>
								`}

						<footer><strong>Total ${formatAmount(statement.total)}</strong></footer>
					</article>
				`,
			)}
		`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-statement-list": CcStatementList;
	}
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/components/cc-statement-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the page in `src/routes/card.ts`**

```ts
import "@picocss/pico/css/pico.min.css";
import "#components/cc-error-banner.ts";
import "#components/cc-statement-list.ts";
import { html, render } from "lit";
import { describeCycle } from "#lib/domain/cycle.ts";
import { today } from "#lib/domain/date.ts";
import { buildStatement, recentPeriods } from "#lib/domain/statement.ts";
import type { Card, Purchase, Statement, StatementPayment } from "#lib/domain/types.ts";
import { bootstrap } from "#lib/ui/page.ts";

const PAGE_SIZE = 12;

bootstrap((repo) => {
	const root = document.querySelector("#page");
	if (!root) return;

	const cardId = new URLSearchParams(location.search).get("id");
	const now = today();

	let card: Card | null = null;
	let purchases: Purchase[] = [];
	let payments: StatementPayment[] = [];
	let shown = PAGE_SIZE;
	let error = "";

	const load = async () => {
		if (!cardId) {
			error = "No card was selected.";
			return paint();
		}
		try {
			card = await repo.getCard(cardId);
			if (!card) {
				error = `No card with the id ${cardId}.`;
			} else {
				purchases = await repo.listPurchases(card.id);
				payments = await repo.listPayments(card.id);
				error = "";
			}
		} catch (failure) {
			error = failure instanceof Error ? failure.message : "Could not read this card.";
		}
		paint();
	};

	const guard = async (action: () => Promise<void>, message: string) => {
		try {
			await action();
		} catch (failure) {
			error = failure instanceof Error ? `${message} ${failure.message}` : message;
		}
		await load();
	};

	const statements = (): Statement[] => {
		if (!card) return [];
		const current = card;
		return recentPeriods(current, now, shown).map((period) =>
			buildStatement(
				current,
				period,
				purchases,
				payments.find((payment) => payment.period === period) ?? null,
			),
		);
	};

	const onMarkPaid = (event: CustomEvent<{ cardId: string; period: string }>) =>
		guard(async () => {
			const statement = statements().find((s) => s.period === event.detail.period);
			if (!statement) return;
			await repo.savePayment({
				cardId: event.detail.cardId,
				period: event.detail.period,
				paidAt: now,
				closeDate: statement.closeDate,
				dueDate: statement.dueDate,
			});
		}, "Could not record the payment.");

	const onUnmarkPaid = (event: CustomEvent<{ cardId: string; period: string }>) =>
		guard(
			() => repo.deletePayment(event.detail.cardId, event.detail.period),
			"Could not undo the payment.",
		);

	const onDeletePurchase = (event: CustomEvent<{ cardId: string; purchaseId: string }>) =>
		guard(
			() => repo.deletePurchase(event.detail.cardId, event.detail.purchaseId),
			"Could not delete the purchase.",
		);

	const paint = () =>
		render(
			html`
				<cc-error-banner .message=${error} retry-label="Reload" @retry=${load}></cc-error-banner>
				${card
					? html`
							<h1>${card.name} <small>••••${card.last4}</small></h1>
							<p>${card.location} — ${describeCycle(card.cycle)}${card.comment ? ` — ${card.comment}` : ""}</p>
							<cc-statement-list
								.statements=${statements()}
								.today=${now}
								@mark-paid=${onMarkPaid}
								@unmark-paid=${onUnmarkPaid}
								@delete-purchase=${onDeletePurchase}
							></cc-statement-list>
							<button class="secondary" @click=${() => {
								shown += PAGE_SIZE;
								paint();
							}}>Show older statements</button>
						`
					: html`<p><a href="/cards">Back to cards</a></p>`}
			`,
			root,
		);

	void load();
});
```

- [ ] **Step 6: Verify in the browser**

Run: `bun run dev`, open a card from the dashboard. Its statements list newest first, a purchase can be deleted, a statement marked paid and unmarked, and "Show older statements" reveals earlier periods.

- [ ] **Step 7: Commit**

```bash
git add src/components/cc-statement-list.ts src/components/cc-statement-list.test.ts src/routes/card.ts
git commit -m "feat: add card detail page with statements and paid state"
```

---

### Task 14: Backup buttons and README

**Files:**
- Modify: `src/routes/cards.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `storage/transfer.ts` (`exportBackup`, `parseBackup`, `importBackup`).
- Produces: nothing new for other tasks.

- [ ] **Step 1: Add the backup panel to `src/routes/cards.ts`**

Add the import at the top:

```ts
import { exportBackup, importBackup, parseBackup } from "#lib/storage/transfer.ts";
```

Add the handlers beside the existing ones:

```ts
const onExport = async () => {
	try {
		const backup = await exportBackup(repo);
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = `cc-tracking-${backup.exportedAt.slice(0, 10)}.json`;
		link.click();
		URL.revokeObjectURL(url);
	} catch (failure) {
		error = failure instanceof Error ? failure.message : "Could not export a backup.";
		paint();
	}
};

const onImport = async (event: Event) => {
	const file = (event.target as HTMLInputElement).files?.[0];
	if (!file) return;
	await guard(async () => {
		await importBackup(repo, parseBackup(await file.text()));
	}, "Could not import that backup.");
};
```

Add the panel to `paint()`, after the card table:

```ts
<article>
	<h2>Backup</h2>
	<p><small>Data lives in this browser only. Export regularly; clearing site data erases everything.</small></p>
	<button class="secondary" @click=${onExport}>Export JSON</button>
	<label>Import JSON <input type="file" accept="application/json" @change=${onImport} /></label>
</article>
```

- [ ] **Step 2: Verify export and import round-trip in the browser**

Run: `bun run dev`, open `/cards`, press "Export JSON" and keep the file. Add a throwaway card, then import the exported file: the throwaway card survives (import merges, it does not wipe) and every original card is restored unchanged.

- [ ] **Step 3: Rewrite `README.md`**

```markdown
# cc-tracking

Tracks company credit cards: where each card physically is, when its statement
closes and payment is due, and which statement a purchase lands on.

## Running it

```bash
bun install
bun run dev      # http://127.0.0.1:3000
bun run build    # static pages into dist/
bun run preview  # serve the build
bun test         # the whole suite
```

## Pages

- `/` — statements due next, quick purchase entry, cards grouped by location
- `/cards` — the card registry, and JSON backup export and import
- `/card?id=<cardId>` — one card's statements, purchases, and paid state

## How statements work

Each card carries a billing cycle rule: either *closes on day N, due M days
later* or *closes on day N, due on day M*. Statements are never stored — they
are computed from that rule, so a period's close date, due date, purchases, and
total are always derived from the card as it is now. Only a paid statement
leaves a record behind, and that record freezes the close and due dates it was
paid against, so editing a cycle rule can never rewrite settled history.

A purchase dated exactly on the close date belongs to that statement, not the
next one.

## Where the data lives

Phase 1 keeps everything in this browser's `localStorage`, under keys shaped
like `cc:card:<id>`, `cc:purchase:<cardId>:<date>:<uuid>`, and
`cc:payment:<cardId>:<period>`. Those are the same shapes the planned
Cloudflare KV namespace uses, so phase 2 swaps the repository implementation
and nothing else. Use the Export button on `/cards` as your backup.

## Design and plans

- `docs/superpowers/specs/2026-09-15-cc-tracking-design.md`
- `docs/superpowers/plans/2026-09-21-cc-tracking-phase-1.md`
```

- [ ] **Step 4: Run the whole suite and a clean build**

Run: `bun test`
Expected: PASS, every file.

Run: `bun run build`
Expected: three HTML pages in `dist/` with their chunks.

Run: `bun run check`
Expected: Biome reports no errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/cards.ts README.md
git commit -m "feat: add backup export and import, document the app"
```

---

## Self-Review

**Spec coverage.** Card registry with id, name, last 4, location, comment, archive — Task 9. Both cycle rule kinds, clamping, the half-open period boundary — Task 3. Purchases in satang — Tasks 2 and 11. Derived statements, totals, frozen payment dates — Task 4. Mark paid and unmark — Tasks 10 and 13. The three dashboard panels — Tasks 10, 11, 12. Card detail with paging — Task 13. Repository seam with KV-shaped keys — Tasks 5 and 6. Export and import — Tasks 7 and 14. Error handling as awaited writes plus a banner, and unusable storage detected at startup — Tasks 6, 8, and every page task. Testing strategy — Tasks 1 and 5.

Not covered, deliberately: the Cloudflare Worker, KV, Cloudflare Access, and `wrangler.toml` (spec phase 2, its own plan), and staff accounts (spec phase 3, not designed). Purchases are added and deleted but not edited in place; the spec's "editable inline" is served by delete-then-add in this phase, which the key-moving behaviour in Task 6 already depends on.

**Placeholders.** None: every step carries the code it needs, and the three placeholder page bodies in Task 8 are explicitly replaced in Tasks 10 to 13.

**Type consistency.** `PlainDate`, `Period`, `Card`, `Purchase`, `StatementPayment`, `Statement`, `CycleRule`, and `Urgency` are defined once in Task 1 and Task 4 and imported everywhere after. `DueRow` is defined in Task 10 and reused in Task 12. `Repository` method names in Tasks 5 and 6 match every call site in Tasks 9 to 14. `nextActionable`, `recentPeriods`, `buildStatement`, `urgencyOf`, `describeCycle`, `periodOfPurchase`, `closeDateOf`, `dueDateOf`, `formatAmount`, `parseAmount`, and `displayDate` are used under exactly the names they are defined with.
