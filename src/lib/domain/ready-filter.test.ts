import { describe, expect, test } from "bun:test";
import type { ReadyRow } from "#lib/domain/home";
import {
	DEFAULT_READY_FILTER,
	filterReady,
	matchesReady,
	readyFilterCount,
	readyLocations,
	readyOwnerOf,
	readyOwners,
} from "#lib/domain/ready-filter";
import type { Card, LimitGroup } from "#lib/domain/types";

const kc: LimitGroup = {
	id: "g1",
	name: "SCB",
	limit: 100_000_00,
	owner: "KC",
};
const nt: LimitGroup = { id: "g2", name: "UOB", limit: 50_000_00, owner: "NT" };
const old: LimitGroup = { id: "g3", name: "Old", limit: 10_000_00 };

const row = (
	id: string,
	group: LimitGroup,
	extra: Partial<Card> = {},
): ReadyRow => ({
	card: {
		id,
		name: `Card ${id}`,
		last4: `${id}000`.slice(0, 4),
		location: "krabi",
		cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 20 },
		archived: false,
		limitGroupId: group.id,
		...extra,
	},
	room: {
		group,
		used: 0,
		available: group.limit,
		held: 0,
		room: group.limit,
		level: "within",
		sharedWith: 0,
	} as ReadyRow["room"],
	closeDate: "2026-11-10",
	dueDate: "2026-11-30",
	overdue: false,
});

const rows = (): ReadyRow[] => [
	row("1", kc),
	row("2", nt, { location: "bangkok", name: "UOB Bangkok" }),
	row("3", kc, { supplementary: true, owner: "RI" }),
	row("4", old, { location: "phichit" }),
];

const ids = (list: ReadyRow[]) => list.map((r) => r.card.id);

describe("readyOwnerOf", () => {
	test("a card answers with its group's owner, a supplementary card with its own", () => {
		const [a, b, c, d] = rows();
		expect(a && readyOwnerOf(a)).toBe("KC");
		expect(b && readyOwnerOf(b)).toBe("NT");
		expect(c && readyOwnerOf(c)).toBe("RI");
		// A group saved before owners existed reads as the default owner.
		expect(d && readyOwnerOf(d)).toBe("KC");
	});
});

describe("readyLocations and readyOwners", () => {
	test("only the places and holders the ready cards have, in their fixed order", () => {
		expect(readyLocations(rows())).toEqual(["bangkok", "phichit", "krabi"]);
		expect(readyLocations(rows().slice(0, 1))).toEqual(["krabi"]);
		expect(readyOwners(rows())).toEqual(["KC", "NT", "RI"]);
		expect(readyOwners(rows().slice(0, 2))).toEqual(["KC", "NT"]);
		expect(readyLocations([])).toEqual([]);
		expect(readyOwners([])).toEqual([]);
	});
});

describe("matchesReady", () => {
	test("the query finds a card by id, name or last 4, in any case, trimmed", () => {
		const [a, b] = rows();
		if (!a || !b) throw new Error("rows");
		expect(matchesReady(a, "")).toBe(true);
		expect(matchesReady(a, "  ")).toBe(true);
		expect(matchesReady(b, "uob")).toBe(true);
		expect(matchesReady(b, " BANGKOK ")).toBe(true);
		expect(matchesReady(b, "2000")).toBe(true);
		expect(matchesReady(a, "uob")).toBe(false);
	});
});

describe("filterReady", () => {
	test("the default filter keeps every row in order", () => {
		expect(ids(filterReady(rows(), DEFAULT_READY_FILTER))).toEqual([
			"1",
			"2",
			"3",
			"4",
		]);
	});

	test("places, holders and the query each narrow, and narrow together", () => {
		const f = DEFAULT_READY_FILTER;
		expect(ids(filterReady(rows(), { ...f, locations: ["krabi"] }))).toEqual([
			"1",
			"3",
		]);
		expect(
			ids(filterReady(rows(), { ...f, locations: ["krabi", "bangkok"] })),
		).toEqual(["1", "2", "3"]);
		expect(ids(filterReady(rows(), { ...f, owners: ["KC"] }))).toEqual([
			"1",
			"4",
		]);
		expect(ids(filterReady(rows(), { ...f, owners: ["RI", "NT"] }))).toEqual([
			"2",
			"3",
		]);
		expect(
			ids(
				filterReady(rows(), {
					q: "card",
					locations: ["krabi"],
					owners: ["KC"],
				}),
			),
		).toEqual(["1"]);
		expect(ids(filterReady(rows(), { ...f, q: "nothing" }))).toEqual([]);
	});

	test("the count of filters in use leaves the query out", () => {
		expect(readyFilterCount(DEFAULT_READY_FILTER)).toBe(0);
		expect(
			readyFilterCount({ q: "x", locations: ["krabi"], owners: ["KC", "NT"] }),
		).toBe(3);
	});
});
