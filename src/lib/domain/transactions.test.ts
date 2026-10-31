import { describe, expect, test } from "bun:test";
import { ledgersFor } from "#lib/domain/ledger";
import {
	byDay,
	DEFAULT_TX_FILTER,
	entriesTotal,
	filterEntries,
	ledgerEntries,
	listIdOf,
	listRows,
	monthSummary,
	owedRows,
	sortEntries,
	type TxEntry,
} from "#lib/domain/transactions";
import type {
	Card,
	CardPayment,
	Purchase,
	PurchaseList,
} from "#lib/domain/types";

const TODAY = "2026-10-31";
const mk = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: `Name ${id}`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
});
const buy = (id: string, extra: Partial<Purchase> = {}): Purchase => ({
	id,
	cardId: "a",
	date: "2026-10-10",
	amount: 100,
	note: "",
	...extra,
});
const pay = (id: string, extra: Partial<CardPayment> = {}): CardPayment => ({
	id,
	cardId: "a",
	date: "2026-10-10",
	amount: 100,
	status: "paid",
	...extra,
});
const cards = [mk("a"), mk("b")];
const ids = (entries: TxEntry[]) =>
	entries.map((e) => (e.kind === "purchase" ? e.purchase.id : e.payment.id));

describe("ledgerEntries", () => {
	test("purchases and paid payments; planned ones are left out", () => {
		const out = ledgerEntries(
			cards,
			[buy("p1")],
			[pay("m1"), pay("m2", { status: "planned" })],
		);
		expect(ids(out).sort()).toEqual(["m1", "p1"]);
		expect(out[0]?.card?.id).toBe("a");
	});

	test("an unknown card leaves card undefined", () => {
		const out = ledgerEntries([], [buy("p1")], []);
		expect(out[0]?.card).toBeUndefined();
	});
});

describe("filterEntries", () => {
	const entries = ledgerEntries(
		cards,
		[
			buy("p1", { amount: 4_123_000, note: "ตั๋วเครื่องบิน" }),
			buy("p2", { cardId: "b", date: "2026-09-02", note: "Lunch" }),
		],
		[pay("m1", { amount: 500, date: "2026-10-31" })],
	);
	const f = (extra: Partial<typeof DEFAULT_TX_FILTER>) =>
		ids(filterEntries(entries, { ...DEFAULT_TX_FILTER, ...extra }, TODAY));

	test("default keeps everything", () => {
		expect(f({}).length).toBe(3);
	});
	test("search finds the amount as printed or as digits", () => {
		expect(f({ q: "41230" })).toEqual(["p1"]);
		expect(f({ q: "฿41,230" })).toEqual(["p1"]);
	});
	test("search finds Thai notes, card names and ignores case", () => {
		expect(f({ q: "เครื่องบิน" })).toEqual(["p1"]);
		expect(f({ q: "LUNCH" })).toEqual(["p2"]);
		expect(f({ q: "name b" })).toEqual(["p2"]);
	});
	test("type and card narrow", () => {
		expect(f({ types: ["payment"] })).toEqual(["m1"]);
		expect(f({ cards: ["b"] })).toEqual(["p2"]);
	});
	test("range month uses the preset", () => {
		expect(f({ range: "month" }).sort()).toEqual(["m1", "p1"]);
	});
	test("a backwards custom range is normalised", () => {
		expect(
			f({ range: "custom", from: "2026-10-31", to: "2026-10-01" }).sort(),
		).toEqual(["m1", "p1"]);
	});
});

describe("sortEntries and byDay", () => {
	const entries = ledgerEntries(
		cards,
		[
			buy("p1", {
				date: "2026-10-10",
				addedAt: "2026-10-10T01:00:00.000Z",
				amount: 300,
			}),
			buy("p2", {
				date: "2026-10-10",
				addedAt: "2026-10-10T02:00:00.000Z",
				amount: 100,
			}),
			buy("p3", { date: "2026-10-12", amount: 200 }),
		],
		[pay("m1", { date: "2026-10-10", amount: 900 })],
	);
	test("new: newest day first, purchases latest added first, then payments", () => {
		expect(ids(sortEntries(entries, "new"))).toEqual(["p3", "p2", "p1", "m1"]);
	});
	test("old reverses the days", () => {
		expect(ids(sortEntries(entries, "old"))).toEqual(["p2", "p1", "m1", "p3"]);
	});
	test("big and small order by amount", () => {
		expect(ids(sortEntries(entries, "big"))).toEqual(["m1", "p1", "p3", "p2"]);
		expect(ids(sortEntries(entries, "small"))).toEqual([
			"p2",
			"p3",
			"p1",
			"m1",
		]);
	});
	test("byDay keeps order", () => {
		const days = byDay(sortEntries(entries, "new"));
		expect(days.map((d) => d.date)).toEqual(["2026-10-12", "2026-10-10"]);
		expect(ids(days[1]?.entries ?? [])).toEqual(["p2", "p1", "m1"]);
	});
	test("total: payments plus, purchases minus", () => {
		expect(entriesTotal(entries)).toBe(900 - 600);
	});
});

describe("monthSummary", () => {
	test("counts only this month", () => {
		const purchases = [
			buy("p1", { amount: 1000 }),
			buy("p2", { date: "2026-09-30", amount: 5000 }),
		];
		const payments = [
			pay("m1", { amount: 200 }),
			pay("m2", { date: "2026-09-01", amount: 700 }),
		];
		const entries = ledgerEntries(cards, purchases, payments);
		const ledgers = ledgersFor(cards, purchases, payments, [], TODAY);
		const out = monthSummary(entries, ledgers, TODAY);
		expect(out.purchases).toBe(1000);
		expect(out.payments).toBe(200);
		expect(out.owed).toBe(6000 - 900);
	});
});

describe("listIdOf", () => {
	test("drops a final numeric segment", () => {
		expect(listIdOf("abc-uuid-3")).toBe("abc-uuid");
		expect(listIdOf("plain")).toBeNull();
		expect(listIdOf("-3")).toBeNull();
		expect(listIdOf("a-b")).toBeNull();
	});
});

describe("listRows", () => {
	const list = (
		id: string,
		date: string,
		status: PurchaseList["status"],
	): PurchaseList => ({
		id,
		date,
		status,
		lines: [],
	});
	const lists = [
		list("x", "2026-10-01", "draft"),
		list("y", "2026-10-05", "saved"),
		list("z", "2026-10-03", "sent"),
	];
	test("newest first; empty filter is all", () => {
		expect(listRows(lists, []).map((l) => l.id)).toEqual(["y", "z", "x"]);
		expect(listRows(lists, ["sent", "draft"]).map((l) => l.id)).toEqual([
			"z",
			"x",
		]);
	});
});

describe("owedRows", () => {
	const cs = [mk("a"), mk("b"), mk("c"), mk("d")];
	const purchases = [
		buy("p1", { cardId: "a", date: "2026-08-10", amount: 100 }), // overdue
		buy("p2", { cardId: "b", date: "2026-10-01", amount: 900 }), // due 14 Nov
		buy("p3", { cardId: "c", date: "2026-10-01", amount: 500 }),
	];
	const ledgers = ledgersFor(cs, purchases, [], [], TODAY);
	const order = (sort: Parameters<typeof owedRows>[3]) =>
		owedRows(cs, ledgers, TODAY, sort).map((r) => r.card.id);
	test("urgency: overdue, then most owed; zero owed left out", () => {
		expect(order("urgency")).toEqual(["a", "b", "c"]);
	});
	test("card, due and left", () => {
		expect(order("card")).toEqual(["a", "b", "c"]);
		expect(order("due")).toEqual(["a", "b", "c"]);
		expect(order("left")).toEqual(["b", "c", "a"]);
	});
	test("credit keeps a card in", () => {
		const withCredit = ledgersFor(
			cs,
			[],
			[pay("m1", { cardId: "d", amount: 50 })],
			[],
			TODAY,
		);
		expect(
			owedRows(cs, withCredit, TODAY, "card").map((r) => r.card.id),
		).toEqual(["d"]);
	});
});
