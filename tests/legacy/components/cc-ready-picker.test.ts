import { afterEach, expect, test } from "vitest"
import "#legacy/components/cc-ready-picker"
import type { CcReadyPicker } from "#legacy/components/cc-ready-picker"

import { setLocale } from "#lib/i18n/index"
import { flat, testGroup, testRow, testRows } from "./ready-test-rows"

afterEach(() => setLocale("en"))

const mount = async (props: Partial<CcReadyPicker> = {}) => {
	document.body.innerHTML = ""
	const element = document.createElement("cc-ready-picker") as CcReadyPicker
	Object.assign(element, {
		rows: testRows(),
		groups: [testGroup],
		selected: [],
		today: "2026-10-31",
		...props,
	})
	document.body.append(element)
	await element.updateComplete
	return { element, root: element.shadowRoot as ShadowRoot }
}

const order = (root: ParentNode) => [...root.querySelectorAll("[data-card]")].map((el) => el.getAttribute("data-card"))

const tile = (root: ParentNode, id: string) => root.querySelector(`[data-card="${id}"]`) as HTMLButtonElement

test("tiles keep the order given, each one native toggle button with nothing interactive inside", async () => {
	const { root } = await mount()
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

test("tapping anywhere on a tile asks to toggle it once; a picked card reads pressed with a filled tick", async () => {
	const { element, root } = await mount()
	const events: CustomEvent[] = []
	element.addEventListener("toggle", (e: Event) => events.push(e as CustomEvent))
	tile(root, "A").click()
	;(tile(root, "B").querySelector(".facts") as HTMLElement).click()
	;(tile(root, "C").querySelector(".room") as HTMLElement).click()
	expect(events.map((e) => e.detail)).toEqual([{ cardId: "A" }, { cardId: "B" }, { cardId: "C" }])
	const again = await mount({ selected: ["A"] })
	expect(tile(again.root, "A").getAttribute("aria-pressed")).toBe("true")
	expect(tile(again.root, "B").getAttribute("aria-pressed")).toBe("false")
	expect(tile(again.root, "A").querySelector(".tick .icon")).not.toBeNull()
	expect(tile(again.root, "B").querySelector(".tick .icon")).toBeNull()
	expect(tile(again.root, "A").querySelector(".tick")?.getAttribute("aria-hidden")).toBe("true")
})

test("a tile is one tab stop; a native button turns Enter and Space into the toggle", async () => {
	const { element, root } = await mount()
	const events: Event[] = []
	element.addEventListener("toggle", (e) => events.push(e))
	const a = tile(root, "A")
	expect(a.tabIndex).toBe(0)
	a.focus()
	expect(root.activeElement).toBe(a)
	a.click()
	expect(events).toHaveLength(1)
})

test("a tile: tick and id) name, the cardholder, the room and its word, then closes and due", async () => {
	const { root } = await mount({
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

test("a Sub card names its cardholder and whose account it draws on", async () => {
	const rows = [
		testRow("B", 60_000_00, "2026-11-10", "2026-11-25", {
			groupOwner: "KC",
			holder: "NT",
		}),
	]
	const { root } = await mount({ rows })
	expect(flat(tile(root, "B").querySelector(".corner"))).toBe("NT · KC's account")
	setLocale("th")
	const thai = await mount({ rows })
	expect(flat(tile(thai.root, "B").querySelector(".corner"))).toBe("NT · บัญชี KC")
})

test("a group with no stored owner reads as KC, as on Cards", async () => {
	const { root } = await mount({
		rows: [testRow("C", 20_000_00, "2026-11-18", "2026-12-03")],
	})
	expect(flat(tile(root, "C").querySelector(".corner"))).toBe("KC")
})

test("the word reads over limit, N% used or credit, as Cards does; plain room has no word and no shared hint", async () => {
	const { root } = await mount({
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

test("no tile says Overdue bill", async () => {
	const { root } = await mount()
	expect(flat(tile(root, "A"))).not.toContain("Overdue")
})

test("each tile is named by its card and room alone", async () => {
	const { root } = await mount()
	expect(tile(root, "B").getAttribute("aria-label")).toBe("Card B, ฿80,000.00 room")
	setLocale("th")
	const thai = await mount()
	expect(tile(thai.root, "B").getAttribute("aria-label")).toBe("Card B วงเงินเหลือ ฿80,000.00")
})
