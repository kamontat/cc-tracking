import { describe, expect, test } from "bun:test";
import { cardLedger } from "#lib/domain/ledger";
import { type PurgePlan, planPurge, purgeCutoff } from "#lib/domain/purge";
import type {
	Card,
	CardPayment,
	Purchase,
	PurchaseList,
	StatementDates,
} from "#lib/domain/types";

const TODAY = "2026-10-30";
// Six months back from TODAY: purchases on 2026-04-30 and later stay.
const CUTOFF = "2026-04-30";

const makeCard = (id: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "0000",
	location: "krabi",
	// Closes on the 10th, so a purchase on the 5th lands in that month's statement.
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 25 },
	archived: false,
});

const kbank = makeCard("kbank");
const scb = makeCard("scb");

const purchase = (
	id: string,
	date: string,
	amount: number,
	cardId = "kbank",
): Purchase => ({ id, cardId, date, amount, note: `purchase ${id}` });

const payment = (
	id: string,
	date: string,
	amount: number,
	extra: Partial<CardPayment> = {},
): CardPayment => ({
	id,
	cardId: "kbank",
	date,
	amount,
	status: "paid",
	...extra,
});

const frozenFor = (cardId: string, period: string): StatementDates => ({
	cardId,
	period,
	closeDate: `${period}-10`,
	dueDate: `${period}-28`,
});

const plan = (
	purchases: Purchase[],
	payments: CardPayment[],
	options: {
		cards?: Card[];
		frozen?: StatementDates[];
		lists?: PurchaseList[];
		cutoff?: string;
	} = {},
): PurgePlan =>
	planPurge(
		options.cards ?? [kbank],
		purchases,
		payments,
		options.frozen ?? [],
		options.lists ?? [],
		options.cutoff ?? CUTOFF,
		TODAY,
	);

/** Apply a plan the way storage will: by id, replacing trimmed payments. */
const apply = (
	p: PurgePlan,
	purchases: Purchase[],
	payments: CardPayment[],
	frozen: StatementDates[] = [],
) => ({
	purchases: purchases.filter((x) => !p.purchaseIds.includes(x.id)),
	payments: payments
		.filter((x) => !p.paymentIds.includes(x.id))
		.map((x) => p.trimmed.find((t) => t.id === x.id) ?? x),
	frozen: frozen.filter(
		(f) =>
			!p.frozenPeriods.some(
				(r) => r.cardId === f.cardId && r.period === f.period,
			),
	),
});

const balances = (
	cards: Card[],
	purchases: Purchase[],
	payments: CardPayment[],
	frozen: StatementDates[] = [],
) =>
	cards.map((c) => {
		const l = cardLedger(c, purchases, payments, frozen, TODAY);
		return { cardId: c.id, owed: l.owed, credit: l.credit };
	});

describe("purgeCutoff", () => {
	test("cutoffs", () => {
		expect(purgeCutoff("6m", TODAY)).toBe("2026-04-30");
		expect(purgeCutoff("1y", TODAY)).toBe("2025-10-30");
		expect(purgeCutoff("3y", TODAY)).toBe("2023-10-30");
		expect(purgeCutoff("all", TODAY)).toBe("2026-10-31");
	});

	test("six months back from a long month clamps to a real date", () => {
		expect(purgeCutoff("6m", "2026-08-31")).toBe("2026-02-28");
		expect(purgeCutoff("1y", "2028-02-29")).toBe("2027-02-28");
		expect(purgeCutoff("6m", "2026-03-15")).toBe("2025-09-15");
	});
});

describe("planPurge", () => {
	test("only fully paid closed statements go", () => {
		// March is paid, April is only half paid.
		const purchases = [
			purchase("mar", "2026-03-05", 1_000),
			purchase("apr", "2026-04-05", 2_000),
		];
		const payments = [payment("p", "2026-03-20", 2_000)];
		const p = plan(purchases, payments, { cutoff: "2026-06-01" });
		expect(p.purchaseIds).toEqual(["mar"]);
		expect(p.trimmed).toEqual([payment("p", "2026-03-20", 1_000)]);

		// Purging everything still leaves the open period, though it is paid.
		const open = [
			purchase("oct", "2026-10-05", 500),
			purchase("nov", "2026-10-20", 700),
		];
		const all = plan(open, [payment("q", "2026-10-25", 1_200)], {
			cutoff: purgeCutoff("all", TODAY),
		});
		expect(all.purchaseIds).toEqual(["oct"]);
		expect(all.paymentIds).toEqual([]);
		expect(all.trimmed).toEqual([payment("q", "2026-10-25", 700)]);
	});

	test("purchases on or after the cutoff stay", () => {
		const purchases = [
			purchase("mar", "2026-03-05", 1_000),
			purchase("may", "2026-05-05", 3_000),
		];
		const payments = [payment("p", "2026-03-20", 4_000)];
		const p = plan(purchases, payments);
		expect(p.purchaseIds).toEqual(["mar"]);
		expect(p.trimmed).toEqual([payment("p", "2026-03-20", 3_000)]);
	});

	test("payments go up to what the purchases took", () => {
		const purchases = [
			purchase("mar", "2026-03-05", 1_000),
			purchase("apr", "2026-04-05", 2_000),
			purchase("may", "2026-05-05", 3_000),
		];
		const payments = [
			payment("p2", "2026-04-20", 2_000),
			payment("p1", "2026-03-20", 1_000),
			payment("p3", "2026-05-20", 3_000),
		];
		const p = plan(purchases, payments);
		expect(p.purchaseIds).toEqual(["mar", "apr"]);
		expect(p.paymentIds).toEqual(["p1", "p2"]);
		expect(p.trimmed).toEqual([]);
	});

	test("an overshooting payment is trimmed, not removed", () => {
		const purchases = [
			purchase("mar", "2026-03-05", 1_000),
			purchase("apr", "2026-04-05", 2_000),
			purchase("may", "2026-05-05", 3_000),
		];
		const payments = [
			payment("p1", "2026-03-20", 1_000),
			payment("p2", "2026-04-20", 2_500, { period: "2026-04" }),
			payment("p3", "2026-05-20", 2_500),
		];
		const p = plan(purchases, payments);
		expect(p.purchaseIds).toEqual(["mar", "apr"]);
		expect(p.paymentIds).toEqual(["p1"]);
		// Same id, date, status and period; only the amount is cut to the overshoot.
		expect(p.trimmed).toEqual([
			payment("p2", "2026-04-20", 500, { period: "2026-04" }),
		]);
	});

	test("when payments before the cutoff fall short, the newest statements stay", () => {
		const purchases = [
			purchase("mar", "2026-03-05", 1_000),
			purchase("apr", "2026-04-05", 2_000),
		];
		// April was paid after the cutoff, so its payment cannot go.
		const payments = [
			payment("p1", "2026-03-20", 1_000),
			payment("p2", "2026-05-01", 2_000),
		];
		const p = plan(purchases, payments);
		expect(p.purchaseIds).toEqual(["mar"]);
		expect(p.paymentIds).toEqual(["p1"]);
		expect(p.trimmed).toEqual([]);

		const none = plan(purchases, [payment("late", "2026-06-01", 3_000)]);
		expect(none.purchaseIds).toEqual([]);
		expect(none.paymentIds).toEqual([]);
		expect(none.trimmed).toEqual([]);
	});

	test("a payment aimed at a statement that stays, stays", () => {
		const purchases = [
			purchase("mar", "2026-03-05", 1_000),
			purchase("may", "2026-05-05", 3_000),
		];
		const payments = [
			payment("aimed", "2026-04-01", 3_000, { period: "2026-05" }),
			payment("pool", "2026-04-10", 1_000),
		];
		const p = plan(purchases, payments);
		expect(p.purchaseIds).toEqual(["mar"]);
		expect(p.paymentIds).toEqual(["pool"]);
		expect(p.trimmed).toEqual([]);
	});

	test("frozen dates for removed statements go", () => {
		const purchases = [
			purchase("mar", "2026-03-05", 1_000),
			purchase("may", "2026-05-05", 3_000),
		];
		const payments = [payment("p", "2026-03-20", 4_000)];
		const frozen = [
			frozenFor("kbank", "2026-03"),
			frozenFor("kbank", "2026-05"),
			frozenFor("scb", "2026-03"),
		];
		const p = plan(purchases, payments, { frozen });
		expect(p.frozenPeriods).toEqual([{ cardId: "kbank", period: "2026-03" }]);
	});

	test("owed and credit are unchanged", () => {
		const cards = [kbank, scb];
		const purchases = [
			purchase("k-mar", "2026-03-05", 1_000),
			purchase("k-apr", "2026-04-05", 2_000),
			purchase("k-may", "2026-05-05", 3_000),
			purchase("k-oct", "2026-10-05", 4_000),
			purchase("k-nov", "2026-10-20", 900),
			purchase("s-feb", "2026-02-05", 1_500, "scb"),
			purchase("s-apr", "2026-04-08", 2_500, "scb"),
		];
		const payments = [
			payment("k1", "2026-03-20", 1_200),
			payment("k2", "2026-04-20", 2_600, { period: "2026-04" }),
			payment("k3", "2026-05-20", 3_000),
			payment("k4", "2026-10-25", 1_000),
			payment("k-plan", "2026-03-01", 9_999, { status: "planned" }),
			// scb is overpaid: 500 credit.
			payment("s1", "2026-02-20", 2_000, { cardId: "scb" }),
			payment("s2", "2026-04-20", 2_500, { cardId: "scb" }),
		];
		const frozen = [frozenFor("kbank", "2026-03"), frozenFor("scb", "2026-02")];

		const before = balances(cards, purchases, payments, frozen);
		expect(before.find((b) => b.cardId === "scb")?.credit).toBe(500);

		const p = plan(purchases, payments, { cards, frozen });
		expect(p.purchaseIds).toEqual(["k-mar", "k-apr", "s-feb", "s-apr"]);

		const after = apply(p, purchases, payments, frozen);
		expect(
			balances(cards, after.purchases, after.payments, after.frozen),
		).toEqual(before);
	});

	test("a card whose plan would move its balance is left alone", () => {
		const cards = [kbank, scb];
		// Two purchases share an id, so deleting the old one by id also deletes the open one.
		const purchases = [
			purchase("dup", "2026-03-05", 1_000),
			purchase("dup", "2026-10-20", 700),
			purchase("s-mar", "2026-03-05", 400, "scb"),
		];
		const payments = [
			payment("k1", "2026-03-20", 1_000),
			payment("s1", "2026-03-20", 400, { cardId: "scb" }),
		];
		const frozen = [frozenFor("kbank", "2026-03"), frozenFor("scb", "2026-03")];
		const p = plan(purchases, payments, { cards, frozen });
		expect(p.purchaseIds).toEqual(["s-mar"]);
		expect(p.paymentIds).toEqual(["s1"]);
		expect(p.trimmed).toEqual([]);
		expect(p.frozenPeriods).toEqual([{ cardId: "scb", period: "2026-03" }]);
	});

	test("saved lists before the cutoff go, others stay", () => {
		const list = (
			id: string,
			date: string,
			status: PurchaseList["status"],
		) => ({
			id,
			date,
			status,
			lines: [{ cardId: "kbank", amount: 1_000 }],
		});
		const lists: PurchaseList[] = [
			list("old-saved", "2026-03-01", "saved"),
			list("cutoff-saved", CUTOFF, "saved"),
			list("new-saved", "2026-05-01", "saved"),
			list("old-sent", "2026-03-01", "sent"),
			list("old-draft", "2026-03-01", "draft"),
		];
		const p = plan([], [], { lists });
		expect(p.listIds).toEqual(["old-saved"]);
	});

	test("planned payments stay", () => {
		const purchases = [purchase("mar", "2026-03-05", 1_000)];
		const payments = [
			payment("planned", "2026-03-01", 1_000, { status: "planned" }),
			payment("paid", "2026-03-20", 1_000),
		];
		const p = plan(purchases, payments);
		expect(p.paymentIds).toEqual(["paid"]);
		expect(p.trimmed).toEqual([]);

		// With only a planned payment the statement is unpaid, so nothing goes.
		const unpaid = plan(purchases, [payments[0] as CardPayment]);
		expect(unpaid.purchaseIds).toEqual([]);
		expect(unpaid.paymentIds).toEqual([]);
	});
});
