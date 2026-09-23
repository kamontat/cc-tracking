import { expect, test } from "bun:test";
import {
	groupUsage,
	outstandingOf,
	spendableRows,
	unassignedCards,
} from "#lib/domain/limit";
import type {
	Card,
	LimitGroup,
	Purchase,
	StatementPayment,
} from "#lib/domain/types";

const TODAY = "2026-09-23";

const card = (overrides: Partial<Card> = {}): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	canPurchase: true,
	limitGroupId: "pool",
	...overrides,
});

const group = (overrides: Partial<LimitGroup> = {}): LimitGroup => ({
	id: "pool",
	name: "KBank account",
	limit: 500_000,
	...overrides,
});

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
	id: "p1",
	cardId: "kbank",
	date: "2026-09-20",
	amount: 10_000,
	note: "fuel",
	...overrides,
});

const payment = (
	overrides: Partial<StatementPayment> = {},
): StatementPayment => ({
	cardId: "kbank",
	period: "2026-08",
	paidAt: "2026-09-02",
	closeDate: "2026-08-18",
	dueDate: "2026-09-02",
	...overrides,
});

test("a card with nothing spent owes nothing", () => {
	expect(outstandingOf(card(), [], [], TODAY)).toBe(0);
});

test("a purchase in the open period counts against the limit straight away", () => {
	// Closes on the 18th, so 20 Sep belongs to the October statement -- still open.
	expect(outstandingOf(card(), [purchase()], [], TODAY)).toBe(10_000);
});

test("a closed statement that is not paid still counts", () => {
	const old = purchase({ id: "p0", date: "2026-08-10", amount: 25_000 });
	expect(outstandingOf(card(), [old], [], TODAY)).toBe(25_000);
});

test("marking the statement paid returns its credit", () => {
	const old = purchase({ id: "p0", date: "2026-08-10", amount: 25_000 });
	expect(outstandingOf(card(), [old], [payment()], TODAY)).toBe(0);
});

test("another card's purchases are not this card's debt", () => {
	const theirs = purchase({ id: "p9", cardId: "scb", amount: 90_000 });
	expect(outstandingOf(card(), [theirs], [], TODAY)).toBe(0);
});

test("usage pools every card in the group, archived ones included", () => {
	const cards = [
		card(),
		card({ id: "scb", archived: true }),
		card({ id: "ttb", limitGroupId: "other" }),
	];
	const purchases = [
		purchase({ id: "a", cardId: "kbank", amount: 10_000 }),
		purchase({ id: "b", cardId: "scb", amount: 5_000 }),
		purchase({ id: "c", cardId: "ttb", amount: 99_000 }),
	];
	expect(groupUsage(group(), cards, purchases, [], TODAY)).toBe(15_000);
});

test("spending on one card reduces what is available on the card sharing its group", () => {
	const cards = [card(), card({ id: "scb" })];
	const purchases = [purchase({ id: "a", cardId: "kbank", amount: 200_000 })];
	const rows = spendableRows(cards, [group()], purchases, [], TODAY);

	expect(rows.map((row) => row.card.id)).toEqual(["kbank", "scb"]);
	expect(rows.map((row) => row.available)).toEqual([300_000, 300_000]);
	expect(rows.map((row) => row.sharedWith)).toEqual([1, 1]);
});

test("a row carries the open period's close and due dates", () => {
	const [row] = spendableRows([card()], [group()], [], [], TODAY);
	// 23 Sep is past the 18th, so today's purchase lands on the October statement.
	expect(row?.closeDate).toBe("2026-10-18");
	expect(row?.dueDate).toBe("2026-11-02");
});

test("rows come back with the most room first", () => {
	const cards = [card(), card({ id: "scb", limitGroupId: "small" })];
	const groups = [group(), group({ id: "small", name: "SCB", limit: 100_000 })];
	const rows = spendableRows(cards, groups, [], [], TODAY);
	expect(rows.map((row) => row.card.id)).toEqual(["kbank", "scb"]);
});

test("available goes negative when the group is over its limit", () => {
	const purchases = [purchase({ amount: 600_000 })];
	const [row] = spendableRows([card()], [group()], purchases, [], TODAY);
	expect(row?.available).toBe(-100_000);
});

test("archived cards and cards closed to purchases are not rows", () => {
	const cards = [
		card({ id: "archived", archived: true }),
		card({ id: "no-purchases", canPurchase: false }),
	];
	expect(spendableRows(cards, [group()], [], [], TODAY)).toEqual([]);
});

test("a card whose group is missing is not a row", () => {
	const noGroupCard: Card = {
		id: "nogroup",
		name: "Card",
		last4: "0000",
		location: "krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
		canPurchase: true,
	};
	const cards = [noGroupCard];
	expect(spendableRows(cards, [group()], [], [], TODAY)).toEqual([]);
});

test("unassigned names the unarchived cards with no group of their own", () => {
	const noGroupCard: Card = {
		id: "nogroup",
		name: "Card",
		last4: "0000",
		location: "krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
		canPurchase: true,
	};
	const oldCard: Card = {
		id: "old",
		name: "Card",
		last4: "0000",
		location: "krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: true,
		canPurchase: true,
	};
	const cards = [
		card(),
		noGroupCard,
		card({ id: "ghost", limitGroupId: "deleted" }),
		oldCard,
	];
	expect(unassignedCards(cards, [group()]).map((c) => c.id)).toEqual([
		"nogroup",
		"ghost",
	]);
});
