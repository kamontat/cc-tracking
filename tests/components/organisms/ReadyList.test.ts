import type { ReadyRow, ReadySort } from "#lib/domain/home"
import type { SortDir } from "#lib/domain/sort"
import type { LimitGroup, PlainDate } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import ReadyList from "#components/organisms/ReadyList.svelte"
import { setLocale } from "#lib/i18n/index"
import { flat, testGroup, testRow, testRows } from "./ready-test-rows"

/**
 * Home's _Ready to use_ tab (RD-22): the count and places, then every ready card as a
 * tile that opens the card's panel over the tab.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

type Props = {
	rows: ReadyRow[]
	places: string[]
	groups: LimitGroup[]
	today: PlainDate
	unassigned: number
	sort: ReadySort
	dir: SortDir
	current: string | null
	onopencard: (id: string) => void
}

const show = (props: Partial<Props> = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(ReadyList, {
		target: document.body,
		props: {
			rows: testRows(),
			groups: [testGroup],
			places: ["Bangkok", "Krabi"],
			today: "2026-10-31",
			unassigned: 0,
			sort: "room",
			dir: "desc",
			...props,
		},
	})
	flushSync()
	return document.body
}

const order = (root: ParentNode) => [...root.querySelectorAll("[data-card]")].map((el) => el.getAttribute("data-card"))

const tile = (root: ParentNode, id: string) => root.querySelector(`[data-card="${id}"]`) as HTMLElement

test("the head counts the ready cards and their places, with no heading (the tab names it)", () => {
	const root = show()
	expect(root.querySelector("h2")).toBeNull()
	expect(flat(root.querySelector(".result-head"))).toBe("3 cards in Bangkok, Krabi")
	const one = show({ rows: testRows().slice(0, 1) })
	expect(flat(one.querySelector(".result-head"))).toBe("1 card in Bangkok, Krabi")
})

const five = () => [
	...testRows(),
	testRow("4", 90_000_00, "2026-11-10", "2026-11-25"),
	testRow("12.3", 10_000_00, "2026-11-10", "2026-11-25"),
]

test("every ready card shows, most room first, each a tile opening the card's panel over the tab", () => {
	const root = show({ rows: five() })
	expect(order(root)).toEqual(["4", "B", "A", "C", "12.3"])
	expect(root.querySelectorAll(".tiles")).toHaveLength(1)
	expect(root.querySelector(".tiles")?.id).toBe("ready-list")
	for (const el of root.querySelectorAll("[data-card]")) {
		expect(el.localName).toBe("a")
		expect(el.classList.contains("tile")).toBe(true)
		expect(el.querySelector(".tick, button, a")).toBeNull()
	}
	expect(root.querySelector('[data-card="12.3"]')?.getAttribute("href")).toBe("/ready?card=12.3")
	// No See more, and no Start a list.
	expect(root.querySelector('[data-action="more"]')).toBeNull()
	expect(root.querySelector('[data-action="start"]')).toBeNull()
})

test("a plain click opens the panel in place, the open card marked; a new-tab click is the browser's", () => {
	const opened: string[] = []
	const root = show({ rows: five(), current: "A", onopencard: (id) => opened.push(id) })
	expect(tile(root, "A").getAttribute("aria-current")).toBe("true")
	expect(tile(root, "B").hasAttribute("aria-current")).toBe(false)
	const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
	tile(root, "12.3").dispatchEvent(click)
	expect(click.defaultPrevented).toBe(true)
	const tab = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true })
	tile(root, "4").dispatchEvent(tab)
	expect(tab.defaultPrevented).toBe(false)
	expect(opened).toEqual(["12.3"])
})

test("sorts by room, close or due, either way", () => {
	const rows = [
		testRow("A", 1_00, "2026-11-12", "2026-11-30"),
		testRow("B", 3_00, "2026-11-10", "2026-12-02"),
		testRow("C", 2_00, "2026-11-14", "2026-11-28"),
	]
	expect(order(show({ rows, sort: "room", dir: "asc" }))).toEqual(["A", "C", "B"])
	expect(order(show({ rows, sort: "close", dir: "desc" }))).toEqual(["C", "A", "B"])
	expect(order(show({ rows, sort: "due", dir: "desc" }))).toEqual(["B", "A", "C"])
	expect(order(show({ rows, sort: "due", dir: "asc" }))).toEqual(["C", "A", "B"])
})

test("nothing ready names the next step and offers no list", () => {
	const root = show({ rows: [] })
	expect(root.querySelector('[data-action="settings"]')?.getAttribute("href")).toBe("/settings/locations")
	expect(flat(root.querySelector(".note"))).toContain("Settings")
	expect(root.querySelectorAll("[data-card]")).toHaveLength(0)
	expect(root.querySelector(".tiles")).toBeNull()
	expect(flat(root.querySelector(".result-head"))).toBe("0 cards in Bangkok, Krabi")
})

test("no line counts cards without a limit group, nor links to assign them (RD-27)", () => {
	const root = show()
	expect(root.querySelector('[data-testid="unassigned"]')).toBeNull()
	expect(root.querySelector('a[href^="/cards?ungrouped"]')).toBeNull()
	expect(flat(root)).not.toContain("no limit group")
})

test("reads in Thai", () => {
	setLocale("th")
	const root = show()
	expect(flat(root.querySelector(".result-head"))).not.toContain("cards in")
})

test("follows a language switch while shown", () => {
	const root = show()
	expect(flat(root.querySelector(".result-head"))).toBe("3 cards in Bangkok, Krabi")
	setLocale("th")
	flushSync()
	expect(flat(root.querySelector(".result-head"))).not.toContain("cards in")
	expect(flat(tile(root, "A").querySelector(".facts"))).toBe("สรุปยอด 10 พ.ย. 2026")
})

test("a tile has three lines: id) name and the last 4, the room with no room word, then when it closes", () => {
	const root = show({ rows: [testRow("A", 60_000_00, "2026-11-25", "2026-12-15")] })
	const a = tile(root, "A")
	expect(flat(a.querySelector(".name"))).toBe("A) Card A")
	expect(flat(a.querySelector(".corner"))).toBe("•••• 1111")
	expect(flat(a.querySelector(".room"))).toBe("฿60,000.00")
	expect(a.querySelector(".room small")).toBeNull()
	expect(a.querySelector(".aside")).toBeNull()
	expect(flat(a.querySelector(".facts"))).toBe("Closes 25 Nov 2026")
	expect(a.dataset["g"]).toBe("teal")
})

test("between a bill's close and its due date the tile says when it is due", () => {
	const root = show({
		rows: [testRow("A", 60_000_00, "2026-11-25", "2026-12-15", { billDue: "2026-11-21" })],
	})
	expect(flat(tile(root, "A").querySelector(".facts"))).toBe("Due 21 Nov 2026")
})

test("over the limit the amount turns red and drops its word; the rail is full and red", () => {
	const root = show({
		rows: [testRow("O", -21_065_00, "2026-11-10", "2026-11-25", { used: 121_065_00 })],
	})
	const room = tile(root, "O").querySelector(".room") as HTMLElement
	expect(flat(room)).toBe("−฿21,065.00")
	expect(room.dataset["tone"]).toBe("bad")
	const rail = tile(root, "O").querySelector(".rail") as HTMLElement
	expect(rail.dataset["level"]).toBe("over")
	expect(rail.querySelector("span")?.getAttribute("style")).toMatch(/inline-size: 100%/)
})

test("from 80% the word reads N% used in the warn tone, and the rail turns amber", () => {
	setLocale("th")
	const root = show({
		rows: [testRow("H", 8_000_00, "2026-11-10", "2026-11-25", { used: 92_000_00 })],
	})
	const word = tile(root, "H").querySelector(".room small") as HTMLElement
	expect(flat(word)).toBe("ใช้ไป 92%")
	expect(word.dataset["tone"]).toBe("warn")
	expect((tile(root, "H").querySelector(".rail") as HTMLElement).dataset["level"]).toBe("high")
	expect(flat(tile(root, "H").querySelector(".facts"))).toBe("สรุปยอด 10 พ.ย. 2026")
})

test("no tile says Overdue bill, the owners or shared: Needs you and the colour say them", () => {
	const root = show({
		rows: [
			testRow("A", 60_000_00, "2026-11-10", "2026-11-25", {
				overdue: true,
				sharedWith: 1,
				groupOwner: "NT",
				holder: "RI",
			}),
		],
	})
	const text = flat(tile(root, "A")) ?? ""
	expect(text).not.toContain("Overdue")
	expect(text).not.toContain("shared")
	expect(text).not.toContain("NT")
	expect(tile(root, "A").querySelector(".tag")).toBeNull()
})

test("a credit still reads under the room on Home; only the plain room word goes", () => {
	const root = show({ rows: [testRow("C", 60_000_00, "2026-11-10", "2026-11-25", { credit: 500_00 })] })
	expect(flat(tile(root, "C").querySelector(".room"))).toBe("฿60,000.00 credit ฿500.00")
})

test("the rail is named by the group's use", () => {
	const root = show()
	const rail = tile(root, "A").querySelector(".rail") as HTMLElement
	expect(rail.getAttribute("role")).toBe("img")
	expect(rail.getAttribute("aria-label")).toBe("40% of the limit used")
	expect(rail.dataset["level"]).toBe("within")
})
