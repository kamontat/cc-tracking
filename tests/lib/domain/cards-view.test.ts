import type { GroupRoom } from "#lib/domain/room"
import type { Card, LimitGroup } from "#lib/domain/types"

import { describe, expect, test } from "vitest"

import { cardsResults, cardUsePct, DEFAULT_CARDS_VIEW, groupPanels, matchesCard } from "#lib/domain/cards-view"
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
const view = (o: Partial<typeof DEFAULT_CARDS_VIEW> = {}) => ({
	...DEFAULT_CARDS_VIEW,
	...o,
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
	test("ungrouped keeps cards with no group, or one that is not stored", () => {
		const f = view({ ungrouped: true })
		expect(matchesCard(card("a"), g, f)).toBe(false)
		expect(matchesCard(card("a"), null, f)).toBe(true)
		const { limitGroupId: _, ...bare } = card("b")
		expect(matchesCard(bare, null, f)).toBe(true)
		expect(cardsResults([card("a"), bare, card("c", { limitGroupId: "gone" })], [g], rooms, f, order).count).toBe(2)
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
		expect(r.sections?.map((s) => [s.location, s.cards.map((c) => c.id)])).toEqual([
			["bangkok", ["a", "c"]],
			["krabi", ["b"]],
		])
		expect(r.archived.map((c) => c.id)).toEqual(["x"])
		expect(r.count).toBe(3)
	})
	test("room: most first, ties by id, unknown group counts as 0", () => {
		const g2 = group("g2")
		const rs = new Map([
			["g", room(g, 50_000)],
			["g2", room(g2, 0)],
		])
		const cs = [
			card("a", { limitGroupId: "g" }),
			card("b", { limitGroupId: "g2" }),
			card("c", { limitGroupId: "g" }),
			card("d", { limitGroupId: "nope" }),
			(({ limitGroupId: _, ...rest }) => rest)(card("e")),
		]
		const r = cardsResults(cs, [g, g2], rs, view({ sort: "room" }), order)
		expect(r.sections).toBeNull()
		expect(r.flat?.map((c) => c.id)).toEqual(["b", "a", "c", "d", "e"])
	})
	test("name: locale compare, ties by id", () => {
		const r = cardsResults(cards, [g], rooms, view({ sort: "name" }), order)
		expect(r.flat?.map((c) => c.id)).toEqual(["a", "c", "b"])
	})
	test("close: by close day, ties by id", () => {
		const cs = [card("a", { cycle: { kind: "fixed", closeDay: 20, dueDay: 5 } }), card("c"), card("b")]
		const r = cardsResults(cs, [g], rooms, view({ sort: "close" }), order, "2026-11-01")
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
			view({ sort: "close" }),
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
		expect(cardsResults(cs, [g], rooms, view({ sort: "close" }), order, "2026-02-20").flat?.map((c) => c.id)).toEqual([
			"0",
			"1",
			"2",
		])
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
			cardsResults(cs, [g], rooms, view({ sort: "close" }), order, "2026-11-01", ledgers).flat?.map((c) => c.id),
		).toEqual(["b", "a"])
		expect(
			cardsResults(cs, [g], rooms, view({ sort: "due" }), order, "2026-11-01", ledgers).flat?.map((c) => c.id),
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
			view({ sort: "due" }),
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
		expect(cardsResults(cs, [g], rooms, view({ sort: "name" }), order).archived.map((c) => c.id)).toEqual([
			"y",
			"z",
			"w",
		])
		const r = cardsResults(cs, [g], rooms, view({ q: "B" }), order)
		expect(r.archived.map((c) => c.id)).toEqual(["z"])
		expect(r.count).toBe(0)
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
			cardsResults(names, [g], rooms, view({ sort: "name" }), order)
			expect(seen.length).toBeGreaterThan(0)
			expect(seen.every((l) => l === locale)).toBe(true)
		}
	} finally {
		String.prototype.localeCompare = original
		setLocale("en")
	}
})
