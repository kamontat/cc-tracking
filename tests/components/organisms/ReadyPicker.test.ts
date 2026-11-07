import type { ReadyRow } from "#lib/domain/home"
import type { LimitGroup, PlainDate } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import ReadyPicker from "#components/organisms/ReadyPicker.svelte"
import { setLocale } from "#lib/i18n/index"
import { flat, testGroup, testRow, testRows } from "./ready-test-rows"

/**
 * The new-list picker's card tiles, each a toggle with a tick. Ported from the legacy
 * `cc-ready-picker` tests, against the same markup.
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
	selected: string[]
	groups: LimitGroup[]
	today: PlainDate
}

const show = (props: Partial<Props> = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const toggled: string[] = []
	mounted = mount(ReadyPicker, {
		target: document.body,
		props: {
			rows: testRows(),
			groups: [testGroup],
			selected: [],
			today: "2026-10-31",
			ontoggle: (cardId: string) => toggled.push(cardId),
			...props,
		},
	})
	flushSync()
	return { root: document.body, toggled }
}

const order = (root: ParentNode) => [...root.querySelectorAll("[data-card]")].map((el) => el.getAttribute("data-card"))

const tile = (root: ParentNode, id: string) => root.querySelector(`[data-card="${id}"]`) as HTMLButtonElement

test("tiles keep the order given, each one native toggle button with nothing interactive inside", () => {
	const { root } = show()
	expect(order(root)).toEqual(["A", "B", "C"])
	expect(root.querySelectorAll(".tiles")).toHaveLength(1)
	for (const el of root.querySelectorAll("[data-card]")) {
		expect(el.localName).toBe("button")
		expect((el as HTMLButtonElement).type).toBe("button")
		expect(el.classList.contains("tile")).toBe(true)
		expect(el.getAttribute("aria-pressed")).toBe("false")
		expect(el.querySelector("a, button, input")).toBeNull()
	}
})

test("a tile wears its group's colour", () => {
	const { root } = show()
	expect(tile(root, "A").getAttribute("data-g")).toBe("teal")
})

test("tapping anywhere on a tile asks to toggle it once; a picked card reads pressed with a filled tick", () => {
	const { root, toggled } = show()
	tile(root, "A").click()
	;(tile(root, "B").querySelector(".facts") as HTMLElement).click()
	;(tile(root, "C").querySelector(".room") as HTMLElement).click()
	expect(toggled).toEqual(["A", "B", "C"])
	const again = show({ selected: ["A"] })
	expect(tile(again.root, "A").getAttribute("aria-pressed")).toBe("true")
	expect(tile(again.root, "B").getAttribute("aria-pressed")).toBe("false")
	expect(tile(again.root, "A").querySelector(".tick .icon")).not.toBeNull()
	expect(tile(again.root, "B").querySelector(".tick .icon")).toBeNull()
	expect(tile(again.root, "A").querySelector(".tick")?.getAttribute("aria-hidden")).toBe("true")
})

test("a tile is one tab stop; a native button turns Enter and Space into the toggle", () => {
	const { root, toggled } = show()
	const a = tile(root, "A")
	expect(a.tabIndex).toBe(0)
	a.focus()
	expect(document.activeElement).toBe(a)
	a.click()
	expect(toggled).toHaveLength(1)
})

test("a tile: tick and id) name, the cardholder, the room and its word, then closes and due", () => {
	const { root } = show({
		rows: [testRow("A", 60_000_00, "2026-11-25", "2026-12-15", { groupOwner: "NT" })],
	})
	const a = tile(root, "A")
	expect(flat(a.querySelector(".name"))).toBe("A) Card A")
	expect(a.querySelector(".name .tick")).not.toBeNull()
	expect(flat(a.querySelector(".corner"))).toBe("NT")
	expect(flat(a.querySelector(".room"))).toBe("฿60,000.00")
	expect(a.querySelector(".aside")).toBeNull()
	expect(flat(a.querySelector(".facts"))).toBe("closes 25 Nov 2026 · due 15 Dec 2026")
})

test("a Sub card names its cardholder and whose account it draws on", () => {
	const rows = [
		testRow("B", 60_000_00, "2026-11-10", "2026-11-25", {
			groupOwner: "KC",
			holder: "NT",
		}),
	]
	const { root } = show({ rows })
	expect(flat(tile(root, "B").querySelector(".corner"))).toBe("NT · KC's account")
	setLocale("th")
	const thai = show({ rows })
	expect(flat(tile(thai.root, "B").querySelector(".corner"))).toBe("NT · บัญชี KC")
})

test("a group with no stored owner reads as KC, as on Cards", () => {
	const { root } = show({
		rows: [testRow("C", 20_000_00, "2026-11-18", "2026-12-03")],
	})
	expect(flat(tile(root, "C").querySelector(".corner"))).toBe("KC")
})

test("the word reads over limit, N% used or credit, as Cards does; plain room has no word and no shared hint", () => {
	const { root } = show({
		rows: [
			testRow("O", -12_000_00, "2026-11-10", "2026-11-25", {
				used: 112_000_00,
				sharedWith: 1,
			}),
			testRow("H", 8_000_00, "2026-11-10", "2026-11-25", { used: 92_000_00 }),
			testRow("P", 60_000_00, "2026-11-10", "2026-11-25", { credit: 500_00 }),
			testRow("S", 60_000_00, "2026-11-10", "2026-11-25", { sharedWith: 1 }),
		],
	})
	const word = (id: string) => tile(root, id).querySelector(".room small") as HTMLElement
	expect(flat(word("O"))).toBe("over limit")
	expect(word("O").dataset["tone"]).toBe("bad")
	expect(flat(word("H"))).toBe("92% used")
	expect(word("H").dataset["tone"]).toBe("warn")
	expect(flat(word("P"))).toBe("credit ฿500.00")
	expect(word("P").dataset["tone"]).toBeUndefined()
	expect(word("S")).toBeNull()
	expect(flat(tile(root, "S").querySelector(".room"))).toBe("฿60,000.00")
})

test("no tile says Overdue bill", () => {
	const { root } = show()
	expect(flat(tile(root, "A"))).not.toContain("Overdue")
})

test("each tile is named by its card and room alone", () => {
	const { root } = show()
	expect(tile(root, "B").getAttribute("aria-label")).toBe("Card B, ฿80,000.00 room")
	setLocale("th")
	const thai = show()
	expect(tile(thai.root, "B").getAttribute("aria-label")).toBe("Card B วงเงินเหลือ ฿80,000.00")
})

test("the tiles follow a switch of language", () => {
	const { root } = show()
	setLocale("th")
	flushSync()
	expect(tile(root, "B").getAttribute("aria-label")).toBe("Card B วงเงินเหลือ ฿80,000.00")
	expect(flat(tile(root, "A").querySelector(".facts"))).not.toContain("closes")
})
