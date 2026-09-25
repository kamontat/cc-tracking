import { expect, test } from "bun:test";
import {
	applyCardView,
	applyGroupView,
	byOwnerThenName,
	DEFAULT_CARD_VIEW,
	DEFAULT_GROUP_VIEW,
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
