import type { ReadyRow } from "#lib/domain/home"
import type { LimitGroup, PlainDate } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import ReadyPanel, { READY_TOP } from "#components/organisms/ReadyPanel.svelte"
import { setLocale } from "#lib/i18n/index"
import { flat, testGroup, testRow, testRows } from "./ready-test-rows"

/**
 * Home's short *Ready to use*. Ported from the legacy `cc-ready-panel` tests, against the same
 * markup.
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
}

const show = (props: Partial<Props> = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(ReadyPanel, {
		target: document.body,
		props: {
			rows: testRows(),
			groups: [testGroup],
			places: ["Bangkok", "Krabi"],
			today: "2026-10-31",
			...props,
		},
	})
	flushSync()
	return document.body
}

const order = (root: ParentNode) => [...root.querySelectorAll("[data-card]")].map((el) => el.getAttribute("data-card"))

const tile = (root: ParentNode, id: string) => root.querySelector(`[data-card="${id}"]`) as HTMLElement

test("Home shows four cards before See more", () => {
	expect(READY_TOP).toBe(4)
})

test("the heading counts the ready cards and their places", () => {
	const root = show()
	expect(flat(root.querySelector("h2"))).toBe("Ready to use")
	expect(flat(root.querySelector(".head small"))).toBe("3 cards in Bangkok, Krabi")
	const one = show({ rows: testRows().slice(0, 1) })
	expect(flat(one.querySelector(".head small"))).toBe("1 card in Bangkok, Krabi")
})

test("only the four cards with the most room show, each a tile linking to its card page", () => {
	const rows = [
		...testRows(),
		testRow("D", 90_000_00, "2026-11-10", "2026-11-25"),
		testRow("E/1", 10_000_00, "2026-11-10", "2026-11-25"),
	]
	const root = show({ rows })
	expect(order(root)).toEqual(["D", "B", "A", "C"])
	expect(root.querySelectorAll(".tiles")).toHaveLength(1)
	expect(root.querySelector(".tiles")?.id).toBe("ready-list")
	for (const el of root.querySelectorAll("[data-card]")) {
		expect(el.localName).toBe("a")
		expect(el.classList.contains("tile")).toBe(true)
		expect(el.querySelector(".tick, button, a")).toBeNull()
	}
	expect(root.querySelector('[data-card="D"]')?.getAttribute("href")).toBe("/card?id=D")
	const odd = show({ rows: [testRow("E/1", 10_000_00, "2026-11-10", "2026-11-25")] })
	expect(odd.querySelector('[data-card="E/1"]')?.getAttribute("href")).toBe("/card?id=E%2F1")
})

test("See more (N) opens the rest in place and Show less folds them; there is no Start a list", () => {
	const rows = [
		...testRows(),
		testRow("D", 90_000_00, "2026-11-10", "2026-11-25"),
		testRow("E", 10_000_00, "2026-11-10", "2026-11-25"),
	]
	const root = show({ rows })
	expect(root.querySelector('[data-action="start"]')).toBeNull()
	expect(root.querySelector('[data-action="see-all"]')).toBeNull()
	const more = () => root.querySelector('[data-action="more"]') as HTMLButtonElement
	expect(flat(more())).toBe("See more (1)")
	expect(more().getAttribute("type")).toBe("button")
	expect(more().getAttribute("data-variant")).toBe("quiet")
	expect(more().getAttribute("aria-controls")).toBe("ready-list")
	expect(more().getAttribute("aria-expanded")).toBe("false")
	more().click()
	flushSync()
	expect(order(root)).toHaveLength(5)
	expect(flat(more())).toBe("Show less")
	expect(more().getAttribute("aria-expanded")).toBe("true")
	more().click()
	flushSync()
	expect(order(root)).toEqual(["D", "B", "A", "C"])
})

test("four cards or fewer have no See more", () => {
	const root = show({ rows: [...testRows(), testRow("D", 90_000_00, "2026-11-10", "2026-11-25")] })
	expect(order(root)).toHaveLength(4)
	expect(root.querySelector('[data-action="more"]')).toBeNull()
})

test("nothing ready names the next step and offers no list", () => {
	const root = show({ rows: [] })
	expect(root.querySelector('[data-action="settings"]')?.getAttribute("href")).toBe("/settings/locations")
	expect(flat(root.querySelector(".note"))).toContain("Settings")
	expect(root.querySelectorAll("[data-card]")).toHaveLength(0)
	expect(root.querySelector(".tiles")).toBeNull()
	expect(flat(root.querySelector(".head small"))).toBe("0 cards in Bangkok, Krabi")
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
	expect(flat(root.querySelector("h2"))).toBe("พร้อมใช้")
})

test("follows a language switch while shown", () => {
	const root = show()
	expect(flat(root.querySelector("h2"))).toBe("Ready to use")
	setLocale("th")
	flushSync()
	expect(flat(root.querySelector("h2"))).toBe("พร้อมใช้")
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
