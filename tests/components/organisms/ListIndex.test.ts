import type { Card, PurchaseList } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import ListIndex from "#components/organisms/ListIndex.svelte"
import { DEFAULT_LISTS_FILTER, type ListsFilter, type ListsGroup } from "#lib/domain/transactions"
import { setLocale } from "#lib/i18n/index"

/**
 * Transactions' Lists tab: sections of purchase-list rows, narrowed by the page's filter, each
 * opening its list in the list panel (RD-23).
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const card = (id: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
})

const lists = (): PurchaseList[] => [
	{
		id: "d1",
		date: "2026-10-31",
		status: "draft",
		lines: [{ cardId: "A", amount: 100_00 }],
	},
	{
		id: "w1",
		date: "2026-10-30",
		status: "sent",
		// Sent late on 31 Oct UTC: 1 Nov in Bangkok, the day the sentence says.
		sentAt: "2026-10-31T18:30:00.000Z",
		lines: [
			{ cardId: "A", amount: 100_00 },
			{ cardId: "B", amount: 200_00 },
		],
	},
	{
		id: "s1",
		date: "2026-10-29",
		status: "saved",
		lines: [
			{ cardId: "A", amount: 100_00, made: true, actual: 90_00 },
			{ cardId: "B", amount: 200_00, made: false },
		],
	},
]

type Options = { lists?: PurchaseList[]; filter?: Partial<ListsFilter>; by?: ListsGroup; current?: string }

/** Mounts the view; `set` changes its lists afterwards, as a repaint does. */
const draw = (options: Options = {}) => {
	const state = new SvelteMap<string, PurchaseList[]>([["lists", options.lists ?? lists()]])
	const seen = { opened: [] as string[] }
	mounted = mount(ListIndex, {
		target: document.body,
		props: {
			get lists() {
				return state.get("lists") ?? []
			},
			cards: [card("A"), card("B")],
			groups: [],
			filter: { ...DEFAULT_LISTS_FILTER, ...options.filter },
			by: options.by ?? "status",
			today: "2026-10-31",
			current: options.current ?? null,
			onopenlist: (list: PurchaseList) => {
				seen.opened.push(list.id)
			},
		},
	})
	flushSync()
	const set = (next: PurchaseList[]) => {
		state.set("lists", next)
		flushSync()
	}
	return { seen, set }
}

const root = document.body
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const head = (id: string) => root.querySelector<HTMLElement>(`[data-row="list:${id}"] .a-hit`)
const click = (el: Element | null | undefined) => {
	;(el as HTMLElement).click()
	flushSync()
}

test("rows are buttons, not links, with date, cards and total", () => {
	draw()
	expect(root.querySelector("a[data-list]")).toBeNull()
	expect([...root.querySelectorAll(".row-panel [data-row]")].map((r) => r.getAttribute("data-row"))).toEqual([
		"list:d1",
		"list:w1",
		"list:s1",
	])
	expect(head("d1")?.localName).toBe("button")
	expect(text(head("w1"))).toContain("2026")
	expect(text(head("w1"))).toContain("Card A, Card B")
	expect(text(head("w1"))).toContain("฿300.00")
	expect(text(head("s1"))).toContain("฿90.00")
	expect(root.querySelector(".a-details")).toBeNull()
})

test("a saved list's total is money out, signed and red; a draft's stays muted", () => {
	draw()
	const s1 = head("s1")?.querySelector(".amount")
	expect(text(s1)).toBe("−฿90.00")
	expect(s1?.classList.contains("out")).toBe(true)
	const d1 = head("d1")?.querySelector(".amount")
	expect(text(d1)).toBe("−฿100.00")
	expect(d1?.classList.contains("muted")).toBe(true)
})

test("a saved list that made nothing shows ฿0.00, unsigned and muted", () => {
	const none: PurchaseList = {
		id: "z1",
		date: "2026-10-28",
		status: "saved",
		lines: [{ cardId: "A", amount: 100_00, made: false }],
	}
	draw({ lists: [none] })
	const z = head("z1")?.querySelector(".amount")
	expect(text(z)).toBe("฿0.00")
	expect(z?.classList.contains("muted")).toBe(true)
	expect(z?.classList.contains("out")).toBe(false)
})

test("a row opens its list in the panel, and the open list's row is marked", () => {
	const { seen } = draw({ current: "w1" })
	expect(head("w1")?.getAttribute("aria-current")).toBe("true")
	expect(head("d1")?.hasAttribute("aria-current")).toBe(false)
	expect(head("d1")?.hasAttribute("aria-expanded")).toBe(false)
	click(head("s1"))
	click(head("d1"))
	expect(seen.opened).toEqual(["s1", "d1"])
	// Its actions are the panel's: the row holds none.
	expect(root.querySelector("[data-action], a")).toBeNull()
})

test("the view draws no filter controls of its own: the page holds them", () => {
	draw()
	expect(root.querySelector("fieldset.chips, [data-status], input[type=search]")).toBeNull()
})

test("empty names the next step", () => {
	draw({ lists: [] })
	const empty = root.querySelector(".empty")
	expect(empty?.textContent?.trim()).toBe("No lists yet. Start one with Add list.")
	expect(empty?.getAttribute("data-refocus")).toBe("lists")
})

test("lists that no filter matches say so instead of asking for a first list", () => {
	const only = lists().filter((l) => l.status === "draft")
	draw({ lists: only, filter: { status: ["saved"] } })
	expect(root.querySelector(".empty")?.textContent?.trim()).toBe("No list matches. Clear a filter to see more.")
	expect(root.querySelector(".empty")?.getAttribute("data-refocus")).toBe("lists")
	expect(root.querySelector("[data-row]")).toBeNull()
})

// DD-109: a hovered row's ground reaches the panel's inner edges, so the panel clips it at its
// rounded corners.
test("the panel clips the hover ground at its rounded corners", async () => {
	const source = await Bun.file("src/components/organisms/ListIndex.svelte").text()
	expect(source).toMatch(/\.row-panel\s*\{[^}]*overflow: clip/)
})

test("a draft with no amounts yet totals ฿0.00 with no sign", () => {
	draw({ lists: [{ id: "d1", date: "2026-10-31", status: "draft", lines: [{ cardId: "A", amount: 0 }] }] })
	expect(text(root.querySelector('[data-row="list:d1"] .a-hit .amount'))).toBe("฿0.00")
})

test("lists sit in sections: drafts, waiting, then saved lists by date, newest first", () => {
	const s2: PurchaseList = { ...(lists()[2] as PurchaseList), id: "s2", date: "2026-10-27" }
	const s3: PurchaseList = { ...(lists()[2] as PurchaseList), id: "s3" }
	draw({ lists: [...lists(), s2, s3] })
	const sections = [...root.querySelectorAll<HTMLElement>("section[data-section]")]
	expect(sections.map((sec) => sec.getAttribute("data-section"))).toEqual([
		"draft",
		"sent",
		"saved:2026-10-29",
		"saved:2026-10-27",
	])
	expect(sections.map((sec) => text(sec.querySelector("h3")))).toEqual([
		"Drafts",
		"Waiting for the spender",
		"Saved · Thu, 29 Oct 2026",
		"Saved · Tue, 27 Oct 2026",
	])
	// Each section is its own row panel; a heading can take focus when a row near it goes.
	expect(sections.map((sec) => [...sec.querySelectorAll(".row-panel [data-row]")].length)).toEqual([1, 1, 2, 1])
	expect(sections[0]?.querySelector("h3")?.getAttribute("tabindex")).toBe("-1")
	expect(sections[0]?.querySelector("h3")?.getAttribute("data-refocus")).toBe("lists:draft")
})

test("by month: a section per month, headed by its name and year", () => {
	draw({ by: "month" })
	const sections = [...root.querySelectorAll<HTMLElement>("section[data-section]")]
	expect(sections.map((sec) => sec.getAttribute("data-section"))).toEqual(["month:2026-10"])
	expect(text(sections[0]?.querySelector("h3"))).toBe("October 2026")
	expect(sections[0]?.querySelectorAll(".row-panel [data-row]")).toHaveLength(3)
})

test("not grouped: one section of every list, newest first", () => {
	draw({ by: "none" })
	const sections = [...root.querySelectorAll<HTMLElement>("section[data-section]")]
	expect(sections.map((sec) => sec.getAttribute("data-section"))).toEqual(["all"])
	expect(text(sections[0]?.querySelector("h3"))).toBe("All lists")
})

test("the filter narrows the rows, and only its sections show", () => {
	draw({ filter: { status: ["saved"] } })
	expect([...root.querySelectorAll("section[data-section]")].map((sec) => sec.getAttribute("data-section"))).toEqual([
		"saved:2026-10-29",
	])
})

test("section headings read in Thai", () => {
	setLocale("th")
	draw()
	expect([...root.querySelectorAll("section[data-section] h3")].map((h) => text(h))).toEqual([
		"ฉบับร่าง",
		"รอคำตอบของผู้ใช้บัตร",
		`บันทึกแล้ว · ${text(root.querySelector('[data-section="saved:2026-10-29"] h3')).split(" · ")[1]}`,
	])
	expect(text(root.querySelector('[data-section="saved:2026-10-29"] h3'))).toContain("ต.ค.")
})

test("search narrows the rows by card or note", () => {
	draw({ filter: { q: "card b" } })
	expect([...root.querySelectorAll("[data-row]")].map((r) => r.getAttribute("data-row"))).toEqual([
		"list:w1",
		"list:s1",
	])
})
