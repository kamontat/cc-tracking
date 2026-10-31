import { describe, expect, test } from "bun:test";
import {
	composeList,
	draftLines,
	lineAmount,
	listLines,
	roomAfter,
	sequentialIds,
} from "#lib/domain/list-entry";
import type { GroupRoom } from "#lib/domain/room";
import type { Card, CardLedger } from "#lib/domain/types";

const mk = (id: string, limitGroupId = "g"): Card => ({
	id,
	name: id,
	last4: "0000",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 25 },
	archived: false,
	limitGroupId,
});

const room = (groupId: string, r: number): GroupRoom => ({
	group: { id: groupId, name: groupId, limit: 100_000_00 },
	used: 0,
	available: r,
	held: 0,
	room: r,
	level: "within",
	sharedWith: 0,
});

const empty: CardLedger = { statements: [], owed: 0, credit: 0 };

describe("list entry", () => {
	test("reads typed amounts", () => {
		expect(lineAmount("")).toBe(0);
		expect(lineAmount("  ")).toBe(0);
		expect(lineAmount("1,250.5")).toBe(125050);
		for (const bad of ["12.345", "-5", "abc", "0"]) {
			expect(lineAmount(bad)).toBeNull();
		}
	});

	test("room after counts the whole group on the list", () => {
		const rooms = new Map([
			["a", room("g", 50_000_00)],
			["b", room("g", 50_000_00)],
			["c", room("h", 40_000_00)],
		]);
		const ledgers = new Map([
			["a", empty],
			["b", empty],
			["c", empty],
		]);
		const lines = draftLines(
			[mk("a"), mk("b"), mk("c", "h")],
			{ a: 20_000_00, b: 10_000_00, c: 5_000_00 },
			rooms,
			ledgers,
		);
		expect(roomAfter(lines[0]!, lines)).toBe(20_000_00);
		expect(roomAfter(lines[1]!, lines)).toBe(20_000_00);
		expect(roomAfter(lines[2]!, lines)).toBe(35_000_00);
	});

	test("draft lines skip cards without a room", () => {
		const lines = draftLines(
			[mk("a"), mk("b")],
			{ a: 100, b: 200 },
			new Map([["a", room("g", 1000)]]),
			new Map([
				["a", empty],
				["b", empty],
			]),
		);
		expect(lines.map((l) => l.card.id)).toEqual(["a"]);
		expect(lines[0]!.planned).toEqual([]);
		expect(lines[0]!.amount).toBe(100);
	});

	test("blank lines are left off the list", () => {
		expect(listLines(["A", "B", "C"], { A: 100, C: 0 })).toEqual([
			{ cardId: "A", amount: 100 },
		]);
	});

	test("a sent list carries its sent time", () => {
		const base = {
			id: "l",
			date: "2026-10-31",
			lines: [],
			now: "2026-10-31T01:00:00.000Z",
		};
		const sent = composeList({ ...base, send: true });
		expect(sent.status).toBe("sent");
		expect(sent.sentAt).toBe(base.now);
		const draft = composeList({ ...base, send: false });
		expect(draft.status).toBe("draft");
		expect("sentAt" in draft).toBe(false);
	});

	test("ids follow the prefix", () => {
		const next = sequentialIds("l1");
		expect([next(), next(), next()]).toEqual(["l1-0", "l1-1", "l1-2"]);
	});
});
