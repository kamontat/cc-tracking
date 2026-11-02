import { describe, expect, test } from "bun:test";
import { groupRoom, heldBy } from "#lib/domain/room";
import type {
	Card,
	CardLedger,
	LimitGroup,
	PurchaseList,
} from "#lib/domain/types";

const group: LimitGroup = { id: "g", name: "Shared", limit: 100_000 };

const mk = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: id,
	last4: "0000",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 25 },
	archived: false,
	limitGroupId: "g",
	...extra,
});

const ledger = (owed: number, credit = 0): CardLedger => ({
	statements: [],
	owed,
	credit,
});

const list = (
	id: string,
	status: PurchaseList["status"],
	lines: PurchaseList["lines"],
): PurchaseList => ({ id, date: "2026-10-30", status, lines });

const a = mk("a");
const b = mk("b");

describe("groupRoom", () => {
	test("room is limit less owed", () => {
		const r = groupRoom(
			group,
			[a, b],
			new Map([
				["a", ledger(30_000)],
				["b", ledger(20_000)],
			]),
			[],
			"a",
		);
		expect(r.used).toBe(50_000);
		expect(r.available).toBe(50_000);
		expect(r.held).toBe(0);
		expect(r.room).toBe(50_000);
		expect(r.level).toBe("within");
	});

	test("credit lifts room above the limit", () => {
		const r = groupRoom(
			group,
			[a],
			new Map([["a", ledger(0, 5_000)]]),
			[],
			"a",
		);
		expect(r.used).toBe(-5_000);
		expect(r.available).toBe(105_000);
		expect(r.room).toBe(105_000);
	});

	test("archived cards still count", () => {
		const old = mk("old", { archived: true });
		const r = groupRoom(
			group,
			[a, old],
			new Map([
				["a", ledger(10_000)],
				["old", ledger(40_000)],
			]),
			[],
			"a",
		);
		expect(r.used).toBe(50_000);
		expect(r.room).toBe(50_000);
	});

	test("a sent list holds room", () => {
		const r = groupRoom(
			group,
			[a, b],
			new Map([["a", ledger(10_000)]]),
			[list("l1", "sent", [{ cardId: "b", amount: 15_000 }])],
			"a",
		);
		expect(r.held).toBe(15_000);
		expect(r.room).toBe(75_000);
	});

	test("a draft list holds nothing", () => {
		const r = groupRoom(
			group,
			[a],
			new Map([["a", ledger(10_000)]]),
			[list("l1", "draft", [{ cardId: "a", amount: 15_000 }])],
			"a",
		);
		expect(r.held).toBe(0);
	});

	test("a list can leave itself out", () => {
		const lists = [list("l1", "sent", [{ cardId: "a", amount: 15_000 }])];
		const r = groupRoom(group, [a], new Map(), lists, "a", "l1");
		expect(r.held).toBe(0);
		expect(heldBy(lists, [a], "g")).toBe(15_000);
		expect(heldBy(lists, [a], "g", "l1")).toBe(0);
	});

	test("sharedWith counts archived cards", () => {
		const old = mk("old", { archived: true });
		const other = mk("x", { limitGroupId: "other" });
		const r = groupRoom(group, [a, b, old, other], new Map(), [], "a");
		expect(r.sharedWith).toBe(2);
	});
});
