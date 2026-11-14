import type { GroupRoom } from "#lib/domain/room"
import type { Card, LimitGroup } from "#lib/domain/types"

import { describe, expect, test } from "vitest"

import {
	CARDS_DIRS,
	CARDS_GROUPS,
	CARDS_SORTS,
	CARDS_STATES,
	CARDS_USAGES,
	cardStates,
	cardsResults,
	cardUsePct,
	DEFAULT_CARDS_VIEW,
	filterCards,
	groupPanels,
	matchesCard,
} from "#lib/domain/cards-view"
import { cardLedger } from "#lib/domain/ledger"
import { setLocale } from "#lib/i18n/index"

const card = (id: string, o: Partial<Card> = {}): Card => ({
	id,
	name: id,
	last4: "1234",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g",
	...o,
})
const group = (id: string, o: Partial<LimitGroup> = {}): LimitGroup => ({
	id,
	name: id,
	limit: 100_000,
	owner: "KC",
	...o,
})
const room = (g: LimitGroup, used: number, held = 0): GroupRoom => ({
	group: g,
	used,
	available: g.limit - used,
	held,
	room: g.limit - used - held,
	level: "within",
	sharedWith: 0,
})
const g = group("g")
const rooms = new Map([["g", room(g, 0)]])
/** A view; its direction is the sort's own default unless given. */
const view = (o: Partial<typeof DEFAULT_CARDS_VIEW> = {}) => ({
	...DEFAULT_CARDS_VIEW,
	...o,
	dir: o.dir ?? CARDS_DIRS[o.sort ?? DEFAULT_CARDS_VIEW.sort],
})
const order = ["bangkok", "phichit", "krabi"]

describe("matchesCard", () => {
	test("empty filter matches", () => {
		expect(matchesCard(card("a"), g, DEFAULT_CARDS_VIEW)).toBe(true)
	})
	test("q over id, name, last4 and comment, trimmed and case-insensitive", () => {
		const c = card("KB", { name: "Visa", last4: "9876", comment: "Travel" })
		for (const q of ["kb", " VISA ", "987", "travel"]) expect(matchesCard(c, g, view({ q }))).toBe(true)
		expect(matchesCard(c, g, view({ q: "zzz" }))).toBe(false)
	})
	test("location and holder", () => {
		const c = card("a", { location: "krabi" })
		expect(matchesCard(c, g, view({ locations: ["krabi"] }))).toBe(true)
		expect(matchesCard(c, g, view({ locations: ["bangkok"] }))).toBe(false)
		expect(matchesCard(c, g, view({ owners: ["KC"] }))).toBe(true)
		expect(matchesCard(c, g, view({ owners: ["NT"] }))).toBe(false)
		const sup = card("b", { supplementary: true, owner: "NT" })
		expect(matchesCard(sup, g, view({ owners: ["NT"] }))).toBe(true)
	})
	test("the filter has no ungrouped: every card has a limit group (RD-27)", () => {
		expect("ungrouped" in DEFAULT_CARDS_VIEW).toBe(false)
	})
	test("unknown group has no holder, so an owner filter drops it", () => {
		expect(matchesCard(card("a"), null, view({ owners: ["KC"] }))).toBe(false)
		expect(matchesCard(card("a"), null, view())).toBe(true)
	})
})

describe("cardsResults", () => {
	const cards = [
		card("b", { name: "Zed", location: "krabi" }),
		card("a", { name: "Amy", location: "bangkok" }),
		card("c", { name: "Bob", location: "bangkok" }),
		card("x", { location: "krabi", archived: true }),
	]
	test("place: sections in location order, by id, empties left out", () => {
		const r = cardsResults(cards, [g], rooms, view(), order)
		expect(r.flat).toBeNull()
		expect(r.sections?.map((s) => [s.key, s.cards.map((c) => c.id)])).toEqual([
			["place:bangkok", ["a", "c"]],
			["place:krabi", ["b"]],
		])
		expect(r.sections?.[0]).toMatchObject({ kind: "place", location: "bangkok" })
		expect(r.archived.map((c) => c.id)).toEqual(["x"])
		expect(r.count).toBe(3)
	})
	test("a card in no stored group is invalid data, left out of every list and the count (RD-27)", () => {
		const { limitGroupId: _, ...bare } = card("b")
		const cs = [
			card("a"),
			bare,
			card("c", { limitGroupId: "gone" }),
			card("d", { limitGroupId: "gone", archived: true }),
		]
		for (const by of CARDS_GROUPS) {
			const r = cardsResults(cs, [g], rooms, view({ by }), order)
			const shown = [...(r.flat ?? r.sections?.flatMap((s) => s.cards) ?? []), ...r.archived].map((c) => c.id)
			expect(shown).toEqual(["a"])
			expect(r.count).toBe(1)
		}
	})
	test("room: most first, ties by id", () => {
		const g2 = group("g2")
		const rs = new Map([
			["g", room(g, 50_000)],
			["g2", room(g2, 0)],
		])
		const cs = [card("a", { limitGroupId: "g" }), card("b", { limitGroupId: "g2" }), card("c", { limitGroupId: "g" })]
		const r = cardsResults(cs, [g, g2], rs, view({ sort: "room", by: "none" }), order)
		expect(r.sections).toBeNull()
		expect(r.flat?.map((c) => c.id)).toEqual(["b", "a", "c"])
	})
	test("each sort has its default direction; the default view is by card, grouped by place", () => {
		expect(DEFAULT_CARDS_VIEW).toMatchObject({ sort: "card", dir: "asc", by: "place", usage: [], states: [] })
		expect(CARDS_STATES).toEqual(["owes", "overdue", "soon", "credit"])
		expect(CARDS_SORTS).toEqual(["card", "room", "name", "close", "due", "used"])
		expect(CARDS_GROUPS).toEqual(["place", "holder", "limit", "none"])
		expect(CARDS_USAGES).toEqual(["used", "unused"])
		expect(CARDS_DIRS).toEqual({ card: "asc", room: "desc", name: "asc", close: "asc", due: "asc", used: "desc" })
	})
	test("a sort runs inside each place", () => {
		const r = cardsResults(cards, [g], rooms, view({ sort: "name", dir: "desc" }), order)
		expect(r.sections?.map((s) => [s.key, s.cards.map((c) => c.id)])).toEqual([
			["place:bangkok", ["c", "a"]],
			["place:krabi", ["b"]],
		])
	})
	test("holder: a section per account holder in KC, NT, RI order", () => {
		const nt = group("g2", { owner: "NT" })
		const cs = [
			card("a", { limitGroupId: "g2" }),
			card("b"),
			card("c", { supplementary: true, owner: "RI" }),
			card("d", { limitGroupId: "gone" }),
		]
		const r = cardsResults(cs, [g, nt], rooms, view({ by: "holder" }), order)
		expect(r.sections?.map((s) => [s.key, s.cards.map((c) => c.id)])).toEqual([
			["holder:KC", ["b"]],
			["holder:NT", ["a"]],
			["holder:RI", ["c"]],
		])
		expect(r.sections?.[2]).toMatchObject({ kind: "holder", owner: "RI" })
		expect(r.count).toBe(3)
	})
	test("limit: a section per limit group A to Z", () => {
		const zed = group("g2", { name: "Zed" })
		const amy = group("g3", { name: "Amy" })
		const cs = [card("a", { limitGroupId: "g2" }), card("b", { limitGroupId: "g3" }), card("c", { limitGroupId: "x" })]
		const r = cardsResults(cs, [zed, amy], rooms, view({ by: "limit" }), order)
		expect(r.sections?.map((s) => [s.key, s.cards.map((c) => c.id)])).toEqual([
			["limit:g3", ["b"]],
			["limit:g2", ["a"]],
		])
		expect(r.sections?.[0]).toMatchObject({ kind: "limit", group: amy })
	})
	test("none: one flat list", () => {
		const r = cardsResults(cards, [g], rooms, view({ by: "none" }), order)
		expect(r.sections).toBeNull()
		expect(r.flat?.map((c) => c.id)).toEqual(["a", "b", "c"])
	})
	test("descending name runs Z to A, ties still by id", () => {
		const cs = [card("b", { name: "Same" }), card("a", { name: "Same" }), card("c", { name: "Zed" })]
		const r = cardsResults(cs, [g], rooms, view({ by: "none", sort: "name", dir: "desc" }), order)
		expect(r.flat?.map((c) => c.id)).toEqual(["c", "a", "b"])
	})
	test("name: locale compare, ties by id", () => {
		const r = cardsResults(cards, [g], rooms, view({ by: "none", sort: "name" }), order)
		expect(r.flat?.map((c) => c.id)).toEqual(["a", "c", "b"])
	})
	test("close: by close day, ties by id", () => {
		const cs = [card("a", { cycle: { kind: "fixed", closeDay: 20, dueDay: 5 } }), card("c"), card("b")]
		const r = cardsResults(cs, [g], rooms, view({ by: "none", sort: "close" }), order, "2026-11-01")
		expect(r.flat?.map((c) => c.id)).toEqual(["b", "c", "a"])
	})
	test("close: upcoming dates cross the year boundary, with today first and archived cards sorted too", () => {
		const cs = [
			card("early", { cycle: { kind: "fixed", closeDay: 5, dueDay: 20 } }),
			card("later", { cycle: { kind: "fixed", closeDay: 20, dueDay: 5 } }),
			card("today", { cycle: { kind: "fixed", closeDay: 15, dueDay: 5 } }),
		]
		const r = cardsResults(
			[...cs, ...cs.map((c) => ({ ...c, id: `${c.id}-archived`, archived: true }))],
			[g],
			rooms,
			view({ by: "none", sort: "close" }),
			order,
			"2026-12-15",
		)
		expect(r.flat?.map((c) => c.id)).toEqual(["today", "later", "early"])
		expect(r.archived.map((c) => c.id)).toEqual(["today-archived", "later-archived", "early-archived"])
	})
	test("close: month-end clamping makes equal dates tie by id", () => {
		const cs = [31, 30, 28].map((closeDay, i) =>
			card(String(i), { cycle: { kind: "offset", closeDay, dueOffsetDays: 20 } }),
		)
		expect(
			cardsResults(cs, [g], rooms, view({ by: "none", sort: "close" }), order, "2026-02-20").flat?.map((c) => c.id),
		).toEqual(["0", "1", "2"])
	})
	test("close: uses the preserved open-statement date displayed on the tile", () => {
		const cs = [card("a"), card("b", { cycle: { kind: "fixed", closeDay: 20, dueDay: 5 } })]
		const ledgers = new Map(
			cs.map((c) => [
				c.id,
				cardLedger(
					c,
					[{ id: "purchase", cardId: "a", date: "2026-11-01", amount: 100, note: "" }],
					[{ id: "payment", cardId: "a", date: "2026-11-01", amount: 100, status: "paid" }],
					[{ cardId: "a", period: "2026-11", closeDate: "2026-11-25", dueDate: "2026-12-15" }],
					"2026-11-01",
				),
			]),
		)
		expect(
			cardsResults(cs, [g], rooms, view({ by: "none", sort: "close" }), order, "2026-11-01", ledgers).flat?.map(
				(c) => c.id,
			),
		).toEqual(["b", "a"])
		expect(
			cardsResults(cs, [g], rooms, view({ by: "none", sort: "due" }), order, "2026-11-01", ledgers).flat?.map(
				(c) => c.id,
			),
		).toEqual(["b", "a"])
	})
	test("due: full upcoming dates, independent of closing order, ties by id and archived sorted too", () => {
		const cs = [
			card("a", { cycle: { kind: "offset", closeDay: 20, dueOffsetDays: 30 } }),
			card("c", { cycle: { kind: "fixed", closeDay: 25, dueDay: 5 } }),
			card("b", { cycle: { kind: "fixed", closeDay: 25, dueDay: 5 } }),
		]
		const r = cardsResults(
			[...cs, ...cs.map((c) => ({ ...c, id: `${c.id}-archived`, archived: true }))],
			[g],
			rooms,
			view({ by: "none", sort: "due" }),
			order,
			"2026-12-15",
		)
		expect(r.flat?.map((c) => c.id)).toEqual(["b", "c", "a"])
		expect(r.archived.map((c) => c.id)).toEqual(["b-archived", "c-archived", "a-archived"])
	})
	test("archived sorted like the rest and filtered too", () => {
		const cs = [
			card("z", { archived: true, name: "B" }),
			card("y", { archived: true, name: "A" }),
			card("w", { archived: true, name: "Q" }),
		]
		expect(cardsResults(cs, [g], rooms, view({ by: "none", sort: "name" }), order).archived.map((c) => c.id)).toEqual([
			"y",
			"z",
			"w",
		])
		const r = cardsResults(cs, [g], rooms, view({ q: "B" }), order)
		expect(r.archived.map((c) => c.id)).toEqual(["z"])
		expect(r.count).toBe(0)
	})
	test("used: what each card owes now, its own and not its group's, most first, ties by id", () => {
		const cs = [card("a"), card("b"), card("c"), card("d")]
		const purchase = (cardId: string, amount: number) => ({
			id: `p-${cardId}`,
			cardId,
			date: "2026-10-20",
			amount,
			note: "",
		})
		const credit = { id: "pay-d", cardId: "d", date: "2026-10-20", amount: 500, status: "paid" as const }
		const ledgers = new Map([
			["a", cardLedger(cs[0] as Card, [purchase("a", 300)], [], [], "2026-11-01")],
			["b", cardLedger(cs[1] as Card, [purchase("b", 900)], [], [], "2026-11-01")],
			["d", cardLedger(cs[3] as Card, [], [credit], [], "2026-11-01")],
		])
		// One group's room is the same for every card on it, so it cannot tell them apart.
		const ids = (dir: "asc" | "desc") =>
			cardsResults(cs, [g], rooms, view({ by: "none", sort: "used", dir }), order, "2026-11-01", ledgers).flat?.map(
				(c) => c.id,
			)
		expect(ids("desc")).toEqual(["b", "a", "c", "d"])
		expect(ids("asc")).toEqual(["d", "c", "a", "b"])
	})
	test("usage: used is a card with a purchase, paid off or not; unused has none; both or neither is any", () => {
		const cs = [card("a"), card("b"), card("c"), card("x", { archived: true })]
		const purchase = { id: "p", cardId: "a", date: "2026-09-01", amount: 300, note: "" }
		const paid = { id: "pay", cardId: "a", date: "2026-10-01", amount: 300, status: "paid" as const }
		const credit = { id: "pay-b", cardId: "b", date: "2026-10-01", amount: 300, status: "paid" as const }
		const ledgers = new Map([
			["a", cardLedger(cs[0] as Card, [purchase], [paid], [], "2026-11-01")],
			["b", cardLedger(cs[1] as Card, [], [credit], [], "2026-11-01")],
		])
		const shown = (usage: ("used" | "unused")[]) => {
			const r = cardsResults(cs, [g], rooms, view({ by: "none", usage }), order, "2026-11-01", ledgers)
			return [...(r.flat ?? []), ...r.archived].map((c) => c.id)
		}
		expect(shown(["used"])).toEqual(["a"])
		expect(shown(["unused"])).toEqual(["b", "c", "x"])
		expect(shown([])).toEqual(["a", "b", "c", "x"])
		expect(shown(["used", "unused"])).toEqual(["a", "b", "c", "x"])
	})
	test("states: owes, a bill past due, a bill due in 7 days, or credit; any of the picked ones", () => {
		const today = "2026-10-25"
		const cs = [card("a"), card("b"), card("c"), card("d"), card("e")]
		const buy = (cardId: string, date: string) => ({ id: `p-${cardId}`, cardId, date, amount: 1_000, note: "" })
		const credit = { id: "pay-d", cardId: "d", date: "2026-10-01", amount: 500, status: "paid" as const }
		const ledgers = new Map([
			["a", cardLedger(cs[0] as Card, [buy("a", "2026-09-05")], [], [], today)],
			["b", cardLedger(cs[1] as Card, [buy("b", "2026-10-05")], [], [], today)],
			["c", cardLedger(cs[2] as Card, [buy("c", "2026-10-20")], [], [], today)],
			["d", cardLedger(cs[3] as Card, [], [credit], [], today)],
		])
		expect(cs.map((c) => cardStates(ledgers.get(c.id), today))).toEqual([
			["owes", "overdue"],
			["owes", "soon"],
			["owes"],
			["credit"],
			[],
		])
		const shown = (states: ("owes" | "overdue" | "soon" | "credit")[]) =>
			cardsResults(cs, [g], rooms, view({ by: "none", states }), order, today, ledgers).flat?.map((c) => c.id)
		expect(shown([])).toEqual(["a", "b", "c", "d", "e"])
		expect(shown(["owes"])).toEqual(["a", "b", "c"])
		expect(shown(["overdue", "soon"])).toEqual(["a", "b"])
		expect(shown(["credit"])).toEqual(["d"])
	})
	test("nothing matches or no cards", () => {
		const r = cardsResults([], [], new Map(), view(), order)
		expect(r).toEqual({ sections: [], flat: null, archived: [], count: 0 })
	})
})

describe("groupPanels", () => {
	test("used plus held, rounded, clamped, full from 80", () => {
		const g1 = group("g1", { limit: 30_000 })
		const g2 = group("g2")
		const g3 = group("g3")
		const rs = new Map([
			["g1", room(g1, 10_000)],
			["g2", room(g2, 50_000, 30_000)],
			["g3", room(g3, -5_000)],
		])
		const cs = [
			card("b", { limitGroupId: "g2" }),
			card("a", { limitGroupId: "g2", archived: true }),
			card("c", { limitGroupId: "g1" }),
		]
		const [p1, p2, p3] = groupPanels([g1, g2, g3], cs, rs)
		expect(p1).toMatchObject({
			usedPct: 33,
			room: 20_000,
			limit: 30_000,
			full: false,
			cardIds: ["c"],
		})
		expect(p2).toMatchObject({
			usedPct: 80,
			room: 20_000,
			full: true,
			cardIds: ["a", "b"],
		})
		expect(p3).toMatchObject({ usedPct: 0, full: false, cardIds: [] })
	})
	test("lists the groups A to Z by name, then by id", () => {
		const panels = groupPanels(
			[
				group("z1", { name: "SCB" }),
				group("b2", { name: "KBank" }),
				group("a1", { name: "KBank" }),
				group("c3", { name: "Amex" }),
			],
			[],
			new Map(),
		)
		expect(panels.map((p) => p.group.id)).toEqual(["c3", "a1", "b2", "z1"])
	})
	test("a group with no computed room reads as untouched", () => {
		expect(groupPanels([g], [], new Map())[0]).toMatchObject({
			room: 100_000,
			usedPct: 0,
		})
	})
})

describe("cardUsePct", () => {
	test("pct from used plus held, null without a room", () => {
		expect(cardUsePct(room(g, 25_000, 25_000))).toBe(50)
		expect(cardUsePct(undefined)).toBeNull()
		expect(cardUsePct(null)).toBeNull()
	})
})

test("name sort compares with the UI locale", () => {
	const names = [card("1", { name: "ขนม" }), card("2", { name: "เกม" })]
	const seen: unknown[] = []
	const original = String.prototype.localeCompare
	String.prototype.localeCompare = function (this: string, that: string, locales?: Intl.LocalesArgument) {
		seen.push(locales)
		return original.call(this, that, locales)
	}
	try {
		for (const locale of ["th", "en"] as const) {
			setLocale(locale)
			seen.length = 0
			cardsResults(names, [g], rooms, view({ by: "none", sort: "name" }), order)
			expect(seen.length).toBeGreaterThan(0)
			expect(seen.every((l) => l === locale)).toBe(true)
		}
	} finally {
		String.prototype.localeCompare = original
		setLocale("en")
	}
})

test("filterCards leaves out a card in no stored limit group: invalid data (RD-27)", () => {
	const { limitGroupId: _, ...loose } = card("L")
	const items = [card("A"), loose, card("B", { limitGroupId: "gone" })]
	expect(filterCards(items, (c) => c, [group("g")], { q: "", locations: [], owners: [] }).map((c) => c.id)).toEqual([
		"A",
	])
})
