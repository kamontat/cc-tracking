import { expect, test } from "bun:test";
import type { SpendRow } from "#lib/domain/limit";
import {
	applyCardView,
	applyDueView,
	applyGroupView,
	applySpendView,
	byOwnerThenName,
	type CardView,
	DEFAULT_CARD_VIEW,
	DEFAULT_DUE_VIEW,
	DEFAULT_GROUP_VIEW,
	DEFAULT_SPEND_VIEW,
	type DueRow,
	nextPanelSort,
	nextSort,
	UNASSIGNED,
} from "#lib/domain/list-view";
import type { Card, LimitGroup } from "#lib/domain/types";

const group = (id: string, name: string, owner?: LimitGroup["owner"]) =>
	({ id, name, limit: 100_000, ...(owner ? { owner } : {}) }) as LimitGroup;

const card = (id: string, overrides: Partial<Card> = {}): Card => ({
	id,
	name: id,
	last4: "0000",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 15 },
	archived: false,
	...overrides,
});

const ids = (list: { id: string }[]) => list.map(({ id }) => id);

test("byOwnerThenName orders groups by owner, then by name within one owner", () => {
	const groups = [
		group("c", "Bravo", "RI"),
		group("a", "Zulu", "KC"),
		group("b", "Alpha", "NT"),
		group("d", "Alpha", "KC"),
	];
	expect(ids([...groups].sort(byOwnerThenName))).toEqual(["d", "a", "b", "c"]);
});

test("byOwnerThenName reads a group without an owner as the default owner", () => {
	const groups = [group("nt", "Alpha", "NT"), group("legacy", "Zulu")];
	expect(ids([...groups].sort(byOwnerThenName))).toEqual(["legacy", "nt"]);
});

test("the default card view keeps the stored order", () => {
	const cards = [card("b"), card("a"), card("c")];
	expect(ids(applyCardView(cards, [], DEFAULT_CARD_VIEW))).toEqual([
		"b",
		"a",
		"c",
	]);
});

test("text search matches name, id, last4 and comment, ignoring case", () => {
	const cards = [
		card("kbank", { name: "KBank Visa" }),
		card("scb", { last4: "4821" }),
		card("uob", { comment: "In the Glovebox" }),
		card("ttb"),
	];
	const search = (q: string) =>
		ids(applyCardView(cards, [], { ...DEFAULT_CARD_VIEW, q }));
	expect(search("visa")).toEqual(["kbank"]);
	expect(search("SCB")).toEqual(["scb"]);
	expect(search("482")).toEqual(["scb"]);
	expect(search("  glovebox ")).toEqual(["uob"]);
	expect(search("")).toEqual(["kbank", "scb", "uob", "ttb"]);
});

test("filters by the card's holder, which a supplementary card answers for itself", () => {
	const groups = [group("kc", "KC pool", "KC")];
	const cards = [
		card("own", { limitGroupId: "kc" }),
		card("supp", { limitGroupId: "kc", supplementary: true, owner: "NT" }),
		card("loose"),
	];
	const by = (owner: "KC" | "NT" | "RI") =>
		ids(applyCardView(cards, groups, { ...DEFAULT_CARD_VIEW, owner }));
	expect(by("KC")).toEqual(["own"]);
	expect(by("NT")).toEqual(["supp"]);
	expect(by("RI")).toEqual([]);
});

test("filters by location", () => {
	const cards = [card("a", { location: "krabi" }), card("b")];
	expect(
		ids(applyCardView(cards, [], { ...DEFAULT_CARD_VIEW, location: "krabi" })),
	).toEqual(["a"]);
});

test("filters by limit group, or by having none", () => {
	const groups = [group("g1", "One"), group("g2", "Two")];
	const cards = [
		card("a", { limitGroupId: "g1" }),
		card("b", { limitGroupId: "g2" }),
		card("c"),
	];
	const by = (value: string) =>
		ids(applyCardView(cards, groups, { ...DEFAULT_CARD_VIEW, group: value }));
	expect(by("g2")).toEqual(["b"]);
	expect(by(UNASSIGNED)).toEqual(["c"]);
});

test("ignores a limit group filter naming a group that no longer exists", () => {
	const cards = [card("a", { limitGroupId: "gone" }), card("b")];
	expect(
		ids(applyCardView(cards, [], { ...DEFAULT_CARD_VIEW, group: "gone" })),
	).toEqual(["a", "b"]);
});

test("sorts cards by name either way", () => {
	const cards = [card("1", { name: "b" }), card("2", { name: "a" })];
	const view = { ...DEFAULT_CARD_VIEW, sort: "name" as const };
	expect(ids(applyCardView(cards, [], view))).toEqual(["2", "1"]);
	expect(ids(applyCardView(cards, [], { ...view, dir: "desc" }))).toEqual([
		"1",
		"2",
	]);
});

test("sorts cards by location in the fixed location order, then by name", () => {
	const cards = [
		card("k", { location: "krabi" }),
		card("p", { location: "phichit" }),
		card("b2", { name: "z" }),
		card("b1", { name: "a" }),
	];
	expect(
		ids(applyCardView(cards, [], { ...DEFAULT_CARD_VIEW, sort: "location" })),
	).toEqual(["b1", "b2", "p", "k"]);
});

test("sorts cards by limit group in dropdown order, unassigned last", () => {
	const groups = [group("ri", "Alpha", "RI"), group("kc", "Zulu", "KC")];
	const cards = [
		card("none"),
		card("r", { limitGroupId: "ri" }),
		card("k", { limitGroupId: "kc" }),
	];
	expect(
		ids(applyCardView(cards, groups, { ...DEFAULT_CARD_VIEW, sort: "group" })),
	).toEqual(["k", "r", "none"]);
});

test("sorts cards by statement close day, then by name", () => {
	const cycle = (closeDay: number) =>
		({ kind: "fixed", closeDay, dueDay: 1 }) as const;
	const cards = [
		card("late", { cycle: cycle(25) }),
		card("b", { cycle: cycle(5) }),
		card("a", { cycle: cycle(5) }),
	];
	expect(
		ids(applyCardView(cards, [], { ...DEFAULT_CARD_VIEW, sort: "closeDay" })),
	).toEqual(["a", "b", "late"]);
});

test("the default group view keeps the stored order", () => {
	const groups = [group("b", "B"), group("a", "A")];
	expect(ids(applyGroupView(groups, {}, DEFAULT_GROUP_VIEW))).toEqual([
		"b",
		"a",
	]);
});

test("filters groups by name and by owner", () => {
	const groups = [
		group("a", "KBank account", "KC"),
		group("b", "SCB account", "NT"),
		group("c", "KBank shared", "NT"),
	];
	expect(
		ids(applyGroupView(groups, {}, { ...DEFAULT_GROUP_VIEW, q: "kbank" })),
	).toEqual(["a", "c"]);
	expect(
		ids(applyGroupView(groups, {}, { ...DEFAULT_GROUP_VIEW, owner: "NT" })),
	).toEqual(["b", "c"]);
});

test("sorts groups by name, limit, used and available", () => {
	const groups = [
		{ ...group("a", "Bravo"), limit: 300 },
		{ ...group("b", "Alpha"), limit: 100 },
		{ ...group("c", "Charlie"), limit: 200 },
	];
	const usage = { a: 250, b: 10, c: 20 };
	const sorted = (sort: "name" | "limit" | "used" | "available") =>
		ids(applyGroupView(groups, usage, { ...DEFAULT_GROUP_VIEW, sort }));
	expect(sorted("name")).toEqual(["b", "a", "c"]);
	expect(sorted("limit")).toEqual(["b", "c", "a"]);
	expect(sorted("used")).toEqual(["b", "c", "a"]);
	// available: a 50, b 90, c 180
	expect(sorted("available")).toEqual(["a", "b", "c"]);
	expect(
		ids(
			applyGroupView(groups, usage, {
				...DEFAULT_GROUP_VIEW,
				sort: "available",
				dir: "desc",
			}),
		),
	).toEqual(["c", "b", "a"]);
});

test("sorts groups by owner in owner order, then by name", () => {
	const groups = [
		group("r", "Alpha", "RI"),
		group("kz", "Zulu", "KC"),
		group("ka", "Alpha", "KC"),
	];
	expect(
		ids(applyGroupView(groups, {}, { ...DEFAULT_GROUP_VIEW, sort: "owner" })),
	).toEqual(["ka", "kz", "r"]);
});

test("sorts groups by how many cards use them", () => {
	const groups = [group("a", "A"), group("b", "B"), group("c", "C")];
	expect(
		ids(
			applyGroupView(
				groups,
				{},
				{ ...DEFAULT_GROUP_VIEW, sort: "cards" },
				{ a: 3, c: 1 },
			),
		),
	).toEqual(["b", "c", "a"]);
});

test("a header click sorts ascending, then descending, then back to the saved order", () => {
	const start = { ...DEFAULT_CARD_VIEW, q: "kept" };
	const first = nextSort(start, "name");
	expect(first).toEqual({ ...start, sort: "name", dir: "asc" });
	const second = nextSort(first, "name");
	expect(second).toEqual({ ...start, sort: "name", dir: "desc" });
	expect(nextSort(second, "name")).toEqual(start);
});

test("a click on another header starts that column ascending", () => {
	const view: CardView = { ...DEFAULT_CARD_VIEW, sort: "name", dir: "desc" };
	expect(nextSort(view, "location")).toEqual({
		...DEFAULT_CARD_VIEW,
		sort: "location",
		dir: "asc",
	});
});

const spendRow = (
	id: string,
	closeDate: string,
	dueDate: string,
	available: number,
): SpendRow => ({
	card: card(id),
	group: group("pool", "Pool"),
	used: 0,
	available,
	closeDate,
	dueDate,
	sharedWith: 0,
});

const rowIds = (rows: { card: Card }[]) => rows.map(({ card }) => card.id);

test("the spendable panel lists the soonest close date first by default", () => {
	const rows = [
		spendRow("late", "2026-10-28", "2026-11-12", 100),
		spendRow("soon", "2026-10-05", "2026-10-20", 300),
		spendRow("mid", "2026-10-18", "2026-11-02", 200),
	];
	expect(rowIds(applySpendView(rows, DEFAULT_SPEND_VIEW))).toEqual([
		"soon",
		"mid",
		"late",
	]);
});

test("sorts the spendable panel by card, available and dates, either way", () => {
	const rows = [
		spendRow("b", "2026-10-05", "2026-11-12", 100),
		spendRow("c", "2026-10-28", "2026-10-20", 300),
		spendRow("a", "2026-10-18", "2026-11-02", 200),
	];
	expect(rowIds(applySpendView(rows, { sort: "card", dir: "asc" }))).toEqual([
		"a",
		"b",
		"c",
	]);
	expect(
		rowIds(applySpendView(rows, { sort: "available", dir: "desc" })),
	).toEqual(["c", "a", "b"]);
	expect(rowIds(applySpendView(rows, { sort: "due", dir: "asc" }))).toEqual([
		"c",
		"a",
		"b",
	]);
	expect(rowIds(applySpendView(rows, { sort: "closes", dir: "desc" }))).toEqual(
		["c", "a", "b"],
	);
});

test("spendable rows closing the same day fall back to the card name", () => {
	const rows = [
		spendRow("b", "2026-10-05", "2026-10-20", 100),
		spendRow("a", "2026-10-05", "2026-10-20", 100),
	];
	expect(rowIds(applySpendView(rows, DEFAULT_SPEND_VIEW))).toEqual(["a", "b"]);
});

const dueRow = (
	id: string,
	closeDate: string,
	dueDate: string,
	total: number,
	location: Card["location"] = "bangkok",
): DueRow => ({
	card: card(id, { location }),
	statement: {
		cardId: id,
		period: "2026-09",
		closeDate,
		dueDate,
		purchases: [],
		total,
		paid: false,
		payment: null,
	},
});

test("the due panel lists the soonest close date first by default", () => {
	const rows = [
		dueRow("late", "2026-10-28", "2026-10-30", 100),
		dueRow("soon", "2026-10-05", "2026-11-20", 300),
		dueRow("mid", "2026-10-18", "2026-11-02", 200),
	];
	expect(rowIds(applyDueView(rows, DEFAULT_DUE_VIEW))).toEqual([
		"soon",
		"mid",
		"late",
	]);
});

test("sorts the due panel by card, location, due date and total, either way", () => {
	const rows = [
		dueRow("b", "2026-10-05", "2026-11-12", 100, "krabi"),
		dueRow("c", "2026-10-28", "2026-10-20", 300, "bangkok"),
		dueRow("a", "2026-10-18", "2026-11-02", 200, "krabi"),
	];
	expect(rowIds(applyDueView(rows, { sort: "card", dir: "desc" }))).toEqual([
		"c",
		"b",
		"a",
	]);
	// Both Krabi cards tie on location, so the sooner close date leads.
	expect(rowIds(applyDueView(rows, { sort: "location", dir: "asc" }))).toEqual([
		"c",
		"b",
		"a",
	]);
	expect(rowIds(applyDueView(rows, { sort: "due", dir: "asc" }))).toEqual([
		"c",
		"a",
		"b",
	]);
	expect(rowIds(applyDueView(rows, { sort: "total", dir: "desc" }))).toEqual([
		"c",
		"a",
		"b",
	]);
});

test("a panel header click sorts ascending, then descending, then back to closes first", () => {
	let view = nextPanelSort(DEFAULT_SPEND_VIEW, "available", DEFAULT_SPEND_VIEW);
	expect(view).toEqual({ sort: "available", dir: "asc" });
	view = nextPanelSort(view, "available", DEFAULT_SPEND_VIEW);
	expect(view).toEqual({ sort: "available", dir: "desc" });
	view = nextPanelSort(view, "available", DEFAULT_SPEND_VIEW);
	expect(view).toEqual(DEFAULT_SPEND_VIEW);
});

test("a click on the closes header flips the default order, and a second flips it back", () => {
	let view = nextPanelSort(DEFAULT_DUE_VIEW, "closes", DEFAULT_DUE_VIEW);
	expect(view).toEqual({ sort: "closes", dir: "desc" });
	view = nextPanelSort(view, "closes", DEFAULT_DUE_VIEW);
	expect(view).toEqual(DEFAULT_DUE_VIEW);
});
