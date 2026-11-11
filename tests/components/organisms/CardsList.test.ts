import type { GroupRoom } from "#lib/domain/room"
import type { Card, CardLedger, LimitGroup, LocationRecord, PlainDate } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, beforeEach, expect, test } from "vitest"

import CardsList from "#components/organisms/CardsList.svelte"
import { type CardsRooms, type CardsView, cardsResults, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view"
import { cardLedger } from "#lib/domain/ledger"
import { setLocale } from "#lib/i18n/index"

/**
 * The Cards page's results: a section per place, or one flat list, of card tiles, with archived
 * cards folded at the end. Ported from the legacy `cc-cards-list` tests, against the same markup.
 */
let mounted: ReturnType<typeof mount> | undefined

beforeEach(() => globalThis.localStorage.clear())
afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const card = (id: string, o: Partial<Card> = {}): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g1",
	...o,
})
const g1: LimitGroup = { id: "g1", name: "SCB", limit: 100_000_00, owner: "KC", color: "blue" }
const g2: LimitGroup = { id: "g2", name: "UOB", limit: 10_000_00, owner: "NT", color: "rose" }
const room = (group: LimitGroup, used: number): GroupRoom => ({
	group,
	used,
	available: group.limit - used,
	held: 0,
	room: group.limit - used,
	level: "within",
	sharedWith: 0,
})
const rooms: CardsRooms = new Map([
	["g1", room(g1, 20_000_00)],
	["g2", room(g2, 9_000_00)],
])
const cards = [
	card("A"),
	card("B/2", { location: "krabi", limitGroupId: "g2" }),
	card("C", { location: "krabi" }),
	card("Z", { archived: true }),
]

type Props = {
	groups: LimitGroup[]
	rooms: CardsRooms
	credits: Map<string, number>
	ledgers: Map<string, CardLedger>
	locations: LocationRecord[]
	total: number
	today: PlainDate
}

const show = (view: Partial<CardsView> = {}, props: Partial<Props> = {}, list: Card[] = cards) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const groups = props.groups ?? [g1, g2]
	mounted = mount(CardsList, {
		target: document.body,
		props: {
			results: cardsResults(list, groups, rooms, { ...DEFAULT_CARDS_VIEW, ...view }, ["bangkok", "phichit", "krabi"]),
			groups,
			rooms,
			credits: new Map([["C", 250_00]]),
			locations: [
				{ id: "bangkok", name: "Bangkok", takesPurchases: false },
				{ id: "krabi", name: "Krabi", takesPurchases: true },
			],
			total: list.length,
			...props,
		},
	})
	flushSync()
	return { root: document.body.querySelector(".cards-list") as HTMLElement }
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("by place: a section per location in order, headed by its name and count", () => {
	const { root } = show()
	const sections = [...root.querySelectorAll("section[data-location]")]
	expect(sections.map((s) => s.getAttribute("data-location"))).toEqual(["bangkok", "krabi"])
	expect(text(sections[0]?.querySelector(".place"))).toBe("Bangkok 1 card")
	expect(text(sections[1]?.querySelector(".place"))).toBe("Krabi 2 cards · takes purchases")
})

test("places are named by their records; one with no record by its id", () => {
	const props = {
		locations: [
			{ id: "bangkok", name: "Head office", takesPurchases: false },
			{ id: "krabi", name: "Krabi", takesPurchases: true },
		],
	}
	const { root } = show({}, props)
	expect(text(root.querySelector("section[data-location=bangkok] .place b"))).toBe("Head office")
	setLocale("th")
	flushSync()
	expect(text(root.querySelector("section[data-location=krabi] .place b"))).toBe("กระบี่")
	setLocale("en")
	const flat = show({ by: "none", sort: "name" }, props, [...cards, card("G", { location: "gone" })])
	expect(text(flat.root.querySelector('a[data-card="G"] .facts'))).toMatch(/ · gone$/)
})

test("by holder: a section per account holder, headed by it and its count, tiles saying the place", () => {
	const { root } = show({ by: "holder" }, {}, [...cards, card("D", { limitGroupId: "gone" })])
	const sections = [...root.querySelectorAll("section[data-section]")]
	expect(sections.map((s) => s.getAttribute("data-section"))).toEqual(["holder:KC", "holder:NT", "holder:none"])
	expect(text(sections[0]?.querySelector(".place"))).toBe("KC 2 cards")
	expect(text(sections[2]?.querySelector(".place"))).toBe("No account holder 1 card")
	expect(text(root.querySelector('a[data-card="B/2"] .facts'))).toMatch(/ · Krabi$/)
})

test("by limit group: a section per group A to Z, then cards in none", () => {
	const { root } = show({ by: "limit" }, {}, [...cards, card("D", { limitGroupId: "gone" })])
	const sections = [...root.querySelectorAll("section[data-section]")]
	expect(sections.map((s) => s.getAttribute("data-section"))).toEqual(["limit:g1", "limit:g2", "limit:none"])
	expect(text(sections[0]?.querySelector(".place"))).toBe("SCB 2 cards")
	expect(text(sections[2]?.querySelector(".place"))).toBe("Not in a group 1 card")
})

test("tiles link to the card page, encoded, in the group's colour", () => {
	const { root } = show()
	const links = [...root.querySelectorAll<HTMLAnchorElement>("section a.tile[data-card]")]
	expect(links.map((a) => a.getAttribute("href"))).toEqual(["/card?id=A", "/card?id=B%2F2", "/card?id=C"])
	expect(links.map((a) => a.dataset["g"])).toEqual(["blue", "rose", "blue"])
	expect(root.querySelectorAll("section .tiles")).toHaveLength(2)
})

test("a tile: id) name and the last 4, the room and its word with the cardholder, then the open period's dates", () => {
	const { limitGroupId: _unused, ...bare } = card("N", { last4: "" })
	const list = [card("A"), card("S", { supplementary: true, owner: "NT" }), bare]
	const { root } = show({}, { today: "2026-10-30" }, list)
	const tile = (id: string) => root.querySelector(`a[data-card="${id}"]`)
	expect(text(tile("A")?.querySelector(".name"))).toBe("A) Card A")
	expect(text(tile("A")?.querySelector(".corner"))).toBe("•••• 1111")
	expect(text(tile("A")?.querySelector(".aside"))).toBe("KC")
	expect(text(tile("A")?.querySelector(".facts"))).toBe("closes 18 Nov 2026 · due 03 Dec 2026")
	expect(tile("A")?.querySelector(".tag")).toBeNull()
	expect(text(tile("S")?.querySelector(".aside"))).toBe("NT · Sub")
	expect(text(tile("N")?.querySelector(".name"))).toBe("N) Card N")
	expect(text(tile("N")?.querySelector(".corner"))).toBe("")
	setLocale("th")
	const thai = show({}, { today: "2026-10-30" }, list)
	expect(text(thai.root.querySelector('a[data-card="S"] .aside'))).toBe("NT · เสริม")
})

test("line 3 takes the open period's dates from the ledger, a paid one's frozen dates included", () => {
	const a = card("A")
	const frozen = [{ cardId: "A", period: "2026-11", closeDate: "2026-11-20", dueDate: "2026-12-07" }]
	const ledgers = new Map([
		[
			"A",
			cardLedger(
				a,
				[{ id: "p", cardId: "A", date: "2026-10-28", amount: 100, note: "" }],
				[{ id: "c", cardId: "A", date: "2026-10-29", amount: 100, status: "paid" }],
				frozen,
				"2026-10-30",
			),
		],
	])
	const { root } = show({}, { today: "2026-10-30", ledgers }, [a])
	expect(text(root.querySelector('a[data-card="A"] .facts'))).toBe("closes 20 Nov 2026 · due 07 Dec 2026")
})

test("line 2: room, N% used from 80% in the warn tone, over limit in red, or credit; the rail matches", () => {
	const over = new Map(rooms)
	over.set("g2", room(g2, 12_000_00))
	const { root } = show()
	const line = (r: ParentNode, id: string) => r.querySelector(`a[data-card="${id}"] .room`)
	const rail = (r: ParentNode, id: string) =>
		r.querySelector<HTMLElement>(`a[data-card="${id}"] .rail`)?.dataset["level"]
	expect(text(line(root, "A"))).toBe("฿80,000.00 room")
	expect(rail(root, "A")).toBe("within")
	expect(text(line(root, "B/2"))).toBe("฿1,000.00 90% used")
	expect(line(root, "B/2")?.querySelector("small")?.dataset["tone"]).toBe("warn")
	expect(rail(root, "B/2")).toBe("high")
	expect(text(line(root, "C"))).toBe("฿80,000.00 credit ฿250.00")
	const red = show({}, { rooms: over })
	expect(text(line(red.root, "B/2"))).toBe("−฿2,000.00 over limit")
	expect(line(red.root, "B/2")?.querySelector("small")?.dataset["tone"]).toBe("bad")
	expect(rail(red.root, "B/2")).toBe("over")
})

test("a card with no limit group, or a deleted one, says so, with no colour and no rail", () => {
	const { root } = show({}, {}, [
		(({ limitGroupId: _, ...rest }) => rest)(card("N")),
		card("D", { limitGroupId: "gone" }),
	])
	for (const id of ["N", "D"]) {
		const tile = root.querySelector<HTMLElement>(`a[data-card="${id}"]`)
		expect(text(tile?.querySelector(".room"))).toBe("No limit group")
		expect(tile?.querySelector("[data-numeric]")).toBeNull()
		expect(tile?.querySelector(".rail")).toBeNull()
		expect(tile?.dataset["g"]).toBeUndefined()
	}
})

test("not grouped is one flat list headed N cards, line 3 adding the place", () => {
	const { root } = show({ by: "none", sort: "name" })
	expect(root.querySelector("section[data-location]")).toBeNull()
	expect(text(root.querySelector(".result-head"))).toBe("3 cards")
	expect(text(root.querySelector('a[data-card="B/2"] .facts'))).toMatch(/ · Krabi$/)
})

test("archived cards fold at the end, closed, and remember being opened", () => {
	const { root } = show()
	const details = root.querySelector("details.archive") as HTMLDetailsElement
	expect(details.open).toBe(false)
	expect(text(details.querySelector("summary"))).toBe("Archived (1)")
	expect(details.querySelector('a[data-card="Z"]')).not.toBeNull()
	expect(root.querySelector('section a[data-card="Z"]')).toBeNull()
	details.open = true
	details.dispatchEvent(new Event("toggle"))
	expect(globalThis.localStorage.getItem("cc:panel:cards-archive")).toBe("open")
	const again = show()
	expect((again.root.querySelector("details.archive") as HTMLDetailsElement).open).toBe(true)
})

test("no archived card, no fold", () => {
	const { root } = show({}, {}, cards.slice(0, 3))
	expect(root.querySelector("details.archive")).toBeNull()
})

test("no match names the way out", () => {
	const { root } = show({ q: "nothing" })
	expect(text(root.querySelector(".empty"))).toBe("No card matches. Clear the search or a filter.")
})

test("no cards at all says how to add one", () => {
	const { root } = show({}, {}, [])
	expect(text(root.querySelector(".empty"))).toBe("No cards yet. Add one with Add card.")
})

test("a language switch re-renders in place", () => {
	const { root } = show()
	const before = root.querySelector('a[data-card="A"]')
	setLocale("th")
	flushSync()
	expect(root.querySelector('a[data-card="A"]')).toBe(before)
	expect(text(root.querySelector('a[data-card="A"] .room small'))).not.toBe("room")
	expect(text(root.querySelector('a[data-card="A"] .facts'))).not.toMatch(/closes/)
	expect(text(root.querySelector("section[data-location=krabi] .place small"))).not.toMatch(/cards/)
})

test("only archived cards match: the no-match line shows above the folded Archived", () => {
	const { root } = show({}, {}, [card("Z", { archived: true })])
	const children = [...root.children]
	expect(text(children[0])).toBe("No card matches. Clear the search or a filter.")
	expect(children[0]?.classList.contains("empty")).toBe(true)
	expect(children[1]?.matches("details.archive")).toBe(true)
	expect(text(children[1]?.querySelector("summary"))).toBe("Archived (1)")
})

test("a group with a colour that is not in the palette gives a tile with no colour", () => {
	const { root } = show({}, { groups: [{ ...g1, color: "nope" as never }, g2] }, [card("A")])
	const tile = root.querySelector<HTMLElement>('a[data-card="A"]')
	expect(tile?.dataset["g"]).toBeUndefined()
})
