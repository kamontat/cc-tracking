import { describe, expect, test } from "bun:test";
import {
	type DraftLine,
	datePassed,
	lineWarnings,
} from "#lib/domain/amount-warnings";
import type { GroupRoom } from "#lib/domain/room";
import type {
	Card,
	CardLedger,
	CardPayment,
	LedgerStatement,
} from "#lib/domain/types";

const today = "2026-10-30";

const mk = (id: string): Card => ({
	id,
	name: id,
	last4: "0000",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 25 },
	archived: false,
	limitGroupId: "g",
});

const room = (r: number, held = 0): GroupRoom => ({
	group: { id: "g", name: "G", limit: 100_000 },
	used: 0,
	available: r + held,
	held,
	room: r,
	level: "within",
	sharedWith: 0,
});

const empty: CardLedger = { statements: [], owed: 0, credit: 0 };

const statement = (dueDate: string, remaining: number): LedgerStatement => ({
	cardId: "a",
	period: "2026-08",
	closeDate: "2026-08-10",
	dueDate,
	purchases: [],
	total: remaining,
	paidAmount: 0,
	remaining,
	paid: false,
	open: false,
});

const line = (
	id: string,
	amount: number,
	r: GroupRoom,
	extra: Partial<DraftLine> = {},
): DraftLine => ({
	card: mk(id),
	amount,
	room: r,
	ledger: empty,
	planned: [],
	...extra,
});

const plan = (date: string, amount: number): CardPayment => ({
	id: date,
	cardId: "a",
	date,
	amount,
	status: "planned",
});

describe("lineWarnings", () => {
	test("over-room when the amount exceeds the room", () => {
		const l = line("a", 60_000, room(50_000, 5_000), {
			planned: [plan("2026-10-20", 1_000)],
		});
		expect(lineWarnings(l, [l], "2026-10-25", today)).toEqual([
			{
				kind: "over-room",
				over: 10_000,
				room: 50_000,
				held: 5_000,
				plannedBefore: 1_000,
			},
		]);
	});

	test("shared limit replaces over-room", () => {
		const r = room(50_000);
		const a = line("b", 30_000, r);
		const b = line("a", 30_000, r);
		const w = lineWarnings(a, [a, b], "2026-10-25", today);
		expect(w).toEqual([
			{ kind: "shared-limit", cardIds: ["a", "b"], over: 10_000 },
		]);
		expect(lineWarnings(b, [a, b], "2026-10-25", today)).toEqual(w);
	});

	test("shared lines that fit give no warning", () => {
		const r = room(50_000);
		const a = line("a", 20_000, r);
		const b = line("b", 20_000, r);
		expect(lineWarnings(a, [a, b], "2026-10-25", today)).toEqual([]);
	});

	test("overdue-bill when the next bill is overdue", () => {
		const l = line("a", 1_000, room(50_000), {
			ledger: {
				statements: [statement("2026-09-01", 500)],
				owed: 500,
				credit: 0,
			},
		});
		expect(lineWarnings(l, [l], "2026-10-25", today)).toEqual([
			{ kind: "overdue-bill", remaining: 500, dueDate: "2026-09-01" },
		]);
	});

	test("close-date on the card's close date", () => {
		const l = line("a", 1_000, room(50_000));
		expect(lineWarnings(l, [l], "2026-10-10", today)).toEqual([
			{ kind: "close-date", closeDate: "2026-10-10" },
		]);
	});

	test("no warnings for a line that fits", () => {
		const l = line("a", 1_000, room(50_000));
		expect(lineWarnings(l, [l], "2026-10-25", today)).toEqual([]);
	});

	test("zero amount gives no room warnings", () => {
		const r = room(-5_000);
		const a = line("a", 0, r);
		const b = line("b", 0, r);
		expect(lineWarnings(a, [a, b], "2026-10-25", today)).toEqual([]);
	});

	test("plannedBefore counts only plans on or before the date", () => {
		const l = line("a", 60_000, room(50_000), {
			planned: [
				plan("2026-10-24", 100),
				plan("2026-10-25", 200),
				plan("2026-10-26", 400),
			],
		});
		const w = lineWarnings(l, [l], "2026-10-25", today)[0];
		expect(w).toMatchObject({ kind: "over-room", plannedBefore: 300 });
	});
});

describe("datePassed", () => {
	test("is false for today", () => {
		expect(datePassed(today, today)).toBe(false);
	});
	test("is true for yesterday", () => {
		expect(datePassed("2026-10-29", today)).toBe(true);
	});
});
