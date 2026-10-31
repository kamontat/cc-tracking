import { describe, expect, test } from "bun:test";
import {
	isReady,
	needsYou,
	READY_SORTS,
	type ReadyRow,
	type RoomData,
	readyRows,
	roomFor,
	sortReady,
} from "#lib/domain/home";
import { ledgersFor } from "#lib/domain/ledger";
import type { Settings } from "#lib/domain/settings";
import type {
	Card,
	CardPayment,
	LimitGroup,
	Purchase,
	PurchaseList,
} from "#lib/domain/types";

const TODAY = "2026-10-31";
const settings: Settings = { purchaseLocations: ["krabi"] };
const g1: LimitGroup = { id: "g1", name: "G1", limit: 100_000_00 };

const mk = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: id,
	last4: "0000",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
});

const buy = (
	id: string,
	cardId: string,
	date: string,
	amount: number,
): Purchase => ({ id, cardId, date, amount, note: id });

const list = (
	id: string,
	status: PurchaseList["status"],
	lines: PurchaseList["lines"],
	date = "2026-10-30",
): PurchaseList => ({ id, date, status, lines });

const data = (
	cards: Card[],
	purchases: Purchase[] = [],
	lists: PurchaseList[] = [],
	payments: CardPayment[] = [],
): RoomData => ({
	cards,
	groups: [g1],
	ledgers: ledgersFor(cards, purchases, payments, [], TODAY),
	lists,
});

describe("readyRows", () => {
	test("ready cards are unarchived, in a purchase place and in a group", () => {
		const { limitGroupId: _none, ...ungrouped } = mk("D");
		const cards: Card[] = [
			mk("A"),
			mk("B", { location: "bangkok" }),
			mk("C", { archived: true }),
			ungrouped,
			mk("E", { limitGroupId: "gone" }),
		];
		expect(isReady(mk("A"), [g1], settings)).toBe(true);
		expect(
			readyRows(data(cards), settings, TODAY).map((r) => r.card.id),
		).toEqual(["A"]);
	});

	test("room is the group's room less sent lists only", () => {
		const a = mk("A");
		const d = data(
			[a],
			[buy("p", "A", "2026-10-28", 30_000_00)],
			[
				list("s", "sent", [{ cardId: "A", amount: 10_000_00 }]),
				list("d", "draft", [{ cardId: "A", amount: 5_000_00 }]),
				list("v", "saved", [{ cardId: "A", amount: 7_000_00 }]),
			],
		);
		const room = roomFor(a, d);
		expect(room?.used).toBe(30_000_00);
		expect(room?.held).toBe(10_000_00);
		expect(room?.room).toBe(60_000_00);
	});

	test("the edited list holds nothing", () => {
		const a = mk("A");
		const d = data(
			[a],
			[],
			[list("s", "sent", [{ cardId: "A", amount: 10_000_00 }])],
		);
		expect(roomFor(a, d, "s")?.held).toBe(0);
	});

	test("close and due dates are for buying today", () => {
		const [row] = readyRows(data([mk("A")]), settings, TODAY);
		expect(row?.closeDate).toBe("2026-11-25");
		expect(row?.dueDate).toBe("2026-12-15");
	});

	test("an unpaid bill past its due date is overdue", () => {
		const a = mk("A");
		const p = [buy("p", "A", "2026-09-10", 4_000_00)];
		expect(readyRows(data([a], p), settings, TODAY)[0]?.overdue).toBe(true);
		const paid: CardPayment = {
			id: "pay",
			cardId: "A",
			date: "2026-10-01",
			amount: 4_000_00,
			status: "paid",
		};
		expect(
			readyRows(data([a], p, [], [paid]), settings, TODAY)[0]?.overdue,
		).toBe(false);
	});
});

describe("sortReady", () => {
	const row = (
		id: string,
		room: number,
		close: string,
		due: string,
	): ReadyRow => ({
		card: mk(id),
		room: { room } as unknown as ReadyRow["room"],
		closeDate: close,
		dueDate: due,
		overdue: false,
	});
	const rows = [
		row("a", 1, "2026-11-03", "2026-12-01"),
		row("b", 3, "2026-11-01", "2026-12-03"),
		row("c", 2, "2026-11-02", "2026-12-02"),
	];
	const ids = (s: ReadyRow[]) => s.map((r) => r.card.id);

	test("sorts by most room, longest to close, latest due", () => {
		expect(READY_SORTS).toEqual(["room", "close", "due"]);
		expect(ids(sortReady(rows, "room"))).toEqual(["b", "c", "a"]);
		expect(ids(sortReady(rows, "close"))).toEqual(["a", "c", "b"]);
		expect(ids(sortReady(rows, "due"))).toEqual(["b", "c", "a"]);
		expect(ids(rows)).toEqual(["a", "b", "c"]);
	});

	test("equal values fall back to id order", () => {
		const same = [
			row("y", 1, "2026-11-01", "2026-12-01"),
			row("x", 1, "2026-11-01", "2026-12-01"),
		];
		for (const s of READY_SORTS)
			expect(ids(sortReady(same, s))).toEqual(["x", "y"]);
	});
});

describe("needsYou", () => {
	test("money at risk first: overdue, late plans, waiting, soon plans, drafts", () => {
		const a = mk("A");
		const d = data(
			[a],
			[buy("p", "A", "2026-09-10", 4_000_00)],
			[
				list("d", "draft", [{ cardId: "A", amount: 2_00 }]),
				list("s", "sent", [{ cardId: "A", amount: 3_00 }]),
			],
		);
		const plan = (id: string, date: string): CardPayment => ({
			id,
			cardId: "A",
			date,
			amount: 100,
			status: "planned",
		});
		const items = needsYou(d, TODAY, [
			plan("soon", "2026-11-02"),
			plan("late", "2026-10-31"),
		]);
		expect(items.map((i) => i.kind)).toEqual([
			"overdue",
			"planned",
			"waiting",
			"planned",
			"draft",
		]);
		const ids = items.flatMap((i) =>
			i.kind === "planned" ? [i.payment.id] : [],
		);
		expect(ids).toEqual(["late", "soon"]);
	});

	test("overdue bills: most days overdue first, ties by card id", () => {
		const b = mk("B");
		const a = mk("A");
		const c = mk("C");
		const d = data(
			[b, a, c],
			[
				buy("pb", "B", "2026-09-10", 1_00),
				buy("pa", "A", "2026-09-10", 1_00),
				buy("pc", "C", "2026-08-10", 1_00),
			],
		);
		const cards = needsYou(d, TODAY).flatMap((i) =>
			i.kind === "overdue" ? [i.card.id] : [],
		);
		expect(cards).toEqual(["C", "A", "B"]);
	});

	test("late plans oldest first, soon plans soonest first, ties by id", () => {
		const plan = (id: string, date: string): CardPayment => ({
			id,
			cardId: "A",
			date,
			amount: 100,
			status: "planned",
		});
		const items = needsYou(data([mk("A")]), TODAY, [
			plan("s2", "2026-11-03"),
			plan("s1b", "2026-11-01"),
			plan("s1a", "2026-11-01"),
			plan("l0", "2026-10-31"),
			plan("l2b", "2026-10-20"),
			plan("l2a", "2026-10-20"),
			{ ...plan("paid", "2026-10-01"), status: "paid" },
		]);
		expect(
			items.flatMap((i) => (i.kind === "planned" ? [i.payment.id] : [])),
		).toEqual(["l2a", "l2b", "l0", "s1a", "s1b", "s2"]);
	});

	test("waiting and draft lists: oldest list date first, ties by id", () => {
		const line = [{ cardId: "A", amount: 1_00 }];
		const items = needsYou(
			data(
				[mk("A")],
				[],
				[
					list("d2", "draft", line, "2026-10-29"),
					list("d1", "draft", line, "2026-10-01"),
					list("wb", "sent", line, "2026-10-20"),
					list("wc", "sent", line, "2026-10-28"),
					list("wa", "sent", line, "2026-10-20"),
				],
			),
			TODAY,
		);
		expect(
			items.map((i) =>
				i.kind === "waiting" || i.kind === "draft" ? i.list.id : "",
			),
		).toEqual(["wa", "wb", "wc", "d1", "d2"]);
	});

	test("needs you lists overdue, then waiting, then drafts", () => {
		const a = mk("A");
		const z = mk("Z", { archived: true });
		const d = data(
			[a, z],
			[
				buy("p", "A", "2026-09-10", 4_000_00),
				buy("q", "Z", "2026-09-10", 1_000_00),
			],
			[
				list("v", "saved", [{ cardId: "A", amount: 1_00 }]),
				list("d", "draft", [{ cardId: "A", amount: 2_00 }]),
				list("s", "sent", [{ cardId: "A", amount: 3_00 }]),
			],
		);
		const items = needsYou(d, TODAY);
		expect(items.map((i) => i.kind)).toEqual(["overdue", "waiting", "draft"]);
		const overdue = items[0];
		if (overdue?.kind !== "overdue") throw new Error("expected overdue");
		expect(overdue.days).toBe(16);
		expect(overdue.dueDate).toBe("2026-10-15");
		expect(overdue.remaining).toBe(4_000_00);
	});

	test("planned payments due within 3 days sit after overdue, before drafts; later ones wait", () => {
		const a = mk("A");
		const d = data(
			[a],
			[buy("p", "A", "2026-09-10", 4_000_00)],
			[list("d", "draft", [{ cardId: "A", amount: 2_00 }])],
		);
		const plan = (id: string, date: string): CardPayment => ({
			id,
			cardId: "A",
			date,
			amount: 100,
			status: "planned",
		});
		const items = needsYou(d, TODAY, [
			plan("far", "2026-11-05"),
			plan("edge", "2026-11-03"),
			plan("old", "2026-10-24"),
		]);
		expect(items.map((i) => i.kind)).toEqual([
			"overdue",
			"planned",
			"planned",
			"draft",
		]);
		const ids = items.flatMap((i) =>
			i.kind === "planned" ? [i.payment.id] : [],
		);
		expect(ids).toEqual(["old", "edge"]);
	});

	test("a quiet day needs nothing", () => {
		expect(needsYou(data([mk("A")]), TODAY)).toEqual([]);
	});
});
