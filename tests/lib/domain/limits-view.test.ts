import type { GroupPanel } from "#lib/domain/cards-view"
import type { Card, LimitGroup } from "#lib/domain/types"

import { describe, expect, test } from "vitest"

import { DEFAULT_LIMITS_VIEW, LIMITS_DIRS, LIMITS_SORTS, limitsResults } from "#lib/domain/limits-view"

const group = (id: string, o: Partial<LimitGroup> = {}): LimitGroup => ({
	id,
	name: id,
	limit: 100_000,
	owner: "KC",
	...o,
})

const card = (id: string, limitGroupId: string, name = id): Card => ({
	id,
	name,
	last4: "1234",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 20 },
	archived: false,
	limitGroupId,
})

const panel = (g: LimitGroup, room: number, usedPct: number, cardIds: string[] = []): GroupPanel => ({
	group: g,
	room,
	limit: g.limit,
	usedPct,
	cardIds,
	full: usedPct >= 80,
})

const KBANK = group("g1", { name: "KBank", owner: "KC" })
const SCB = group("g2", { name: "SCB", owner: "NT" })
const AMEX = group("g3", { name: "Amex", owner: "RI" })

const PANELS = [panel(AMEX, 90_000, 10, ["5"]), panel(KBANK, 20_000, 80, ["7", "9"]), panel(SCB, 50_000, 50, ["12.3"])]
const CARDS = [card("5", "g3", "Platinum"), card("7", "g1", "Visa"), card("9", "g1", "Titanium"), card("12.3", "g2")]

const names = (panels: GroupPanel[]) => panels.map((p) => p.group.name)

describe("the Limits tab's view", () => {
	test("sorts by name, room or used; room and used run most first", () => {
		expect(LIMITS_SORTS).toEqual(["name", "room", "used"])
		expect(LIMITS_DIRS).toEqual({ name: "asc", room: "desc", used: "desc" })
		expect(DEFAULT_LIMITS_VIEW).toEqual({ q: "", owners: [], sort: "name", dir: "asc" })
	})
})

describe("limitsResults", () => {
	test("the defaults keep every group, A to Z", () => {
		expect(names(limitsResults(PANELS, CARDS, DEFAULT_LIMITS_VIEW))).toEqual(["Amex", "KBank", "SCB"])
	})

	test("searches a group's name and its cards' names, any case, trimmed", () => {
		expect(names(limitsResults(PANELS, CARDS, { ...DEFAULT_LIMITS_VIEW, q: " kba " }))).toEqual(["KBank"])
		expect(names(limitsResults(PANELS, CARDS, { ...DEFAULT_LIMITS_VIEW, q: "TITAN" }))).toEqual(["KBank"])
		expect(names(limitsResults(PANELS, CARDS, { ...DEFAULT_LIMITS_VIEW, q: "plat" }))).toEqual(["Amex"])
		expect(names(limitsResults(PANELS, CARDS, { ...DEFAULT_LIMITS_VIEW, q: "nothing" }))).toEqual([])
	})

	test("filters by the group's account holder", () => {
		expect(names(limitsResults(PANELS, CARDS, { ...DEFAULT_LIMITS_VIEW, owners: ["NT", "RI"] }))).toEqual([
			"Amex",
			"SCB",
		])
	})

	test("sorts by room or by the share used, either way, ties by name", () => {
		const by = (sort: "room" | "used", dir: "asc" | "desc") =>
			names(limitsResults(PANELS, CARDS, { ...DEFAULT_LIMITS_VIEW, sort, dir }))
		expect(by("room", "desc")).toEqual(["Amex", "SCB", "KBank"])
		expect(by("room", "asc")).toEqual(["KBank", "SCB", "Amex"])
		expect(by("used", "desc")).toEqual(["KBank", "SCB", "Amex"])
		expect(by("used", "asc")).toEqual(["Amex", "SCB", "KBank"])
		const tied = [panel(SCB, 10, 5), panel(KBANK, 10, 5)]
		expect(names(limitsResults(tied, [], { ...DEFAULT_LIMITS_VIEW, sort: "room", dir: "desc" }))).toEqual([
			"KBank",
			"SCB",
		])
		expect(names(limitsResults(PANELS, CARDS, { ...DEFAULT_LIMITS_VIEW, dir: "desc" }))).toEqual([
			"SCB",
			"KBank",
			"Amex",
		])
	})
})
