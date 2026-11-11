import type { Card, PurchaseList } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import ListIndex from "#components/organisms/ListIndex.svelte"
import { DEFAULT_LISTS_FILTER, type ListsFilter, type ListsGroup } from "#lib/domain/transactions"
import { setLocale } from "#lib/i18n/index"

/**
 * Transactions' Lists view: sections of purchase-list rows, narrowed by the page's filter, that open in
 * place. Ported from the legacy `cc-list-index` tests, against the same markup.
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

type Options = { lists?: PurchaseList[]; filter?: Partial<ListsFilter>; by?: ListsGroup }

/** Mounts the view; `set` changes its lists afterwards, as a repaint does. */
const draw = (options: Options = {}) => {
	const state = new SvelteMap<string, PurchaseList[]>([["lists", options.lists ?? lists()]])
	const seen = {
		confirm: [] as PurchaseList[],
		deleted: [] as PurchaseList[],
		merged: [] as PurchaseList[],
	}
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
			onconfirmlist: (list: PurchaseList) => {
				seen.confirm.push(list)
			},
			ondeletedraft: (list: PurchaseList) => {
				seen.deleted.push(list)
			},
			onmergelists: (list: PurchaseList) => {
				seen.merged.push(list)
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
const shown = () => root.querySelector<HTMLElement>(".a-details:not([hidden])")
const click = (el: Element | null | undefined) => {
	;(el as HTMLElement).click()
	flushSync()
}
/** Lets the focus hand-off, which waits a tick, run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

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
	expect(shown()).toBeNull()
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

test("one row is open at a time", () => {
	draw()
	click(head("d1"))
	click(head("w1"))
	expect(root.querySelectorAll(".a-details:not([hidden])").length).toBe(1)
	expect(head("w1")?.getAttribute("aria-expanded")).toBe("true")
	expect(head("d1")?.getAttribute("aria-expanded")).toBe("false")
})

test("row details ids are namespaced by the component and the row", () => {
	draw()
	expect(head("d1")?.getAttribute("aria-controls")).toBe("cc-list-index-list:d1")
})

test("an opened draft shows its lines, Continue and a one-step Delete", () => {
	const { seen } = draw()
	click(head("d1"))
	const open = shown() as HTMLElement
	expect(text(open.querySelector(".a-part"))).toContain("฿100.00")
	expect(open.querySelector(".a-total")).toBeNull()
	expect(text(open.querySelector(".a-say"))).toBe("Not sent yet.")
	const btns = [...open.querySelectorAll(".a-btns > *")]
	expect(btns.map((b) => b.getAttribute("data-action"))).toEqual(["continue", "delete-draft"])
	expect(btns[0]?.localName).toBe("a")
	expect(btns[0]?.classList.contains("btn")).toBe(true)
	expect(btns[0]?.getAttribute("href")).toBe("/list/draft?id=d1")
	expect(btns[1]?.getAttribute("data-variant")).toBe("danger")
	click(btns[1])
	expect(seen.deleted).toEqual([lists()[0]])
})

test("an opened sent list offers Record reply and a two-step Confirm", () => {
	const { seen } = draw()
	click(head("w1"))
	const btns = [...(shown() as HTMLElement).querySelectorAll(".a-btns > *")]
	expect(btns.map((b) => b.getAttribute("data-action"))).toEqual(["record-reply", "confirm-list"])
	expect(btns[0]?.getAttribute("href")).toBe("/list/reply?id=w1")
	expect(text(shown()?.querySelector(".a-say"))).toBe("Sent 1 Nov. Confirm saves every line as made.")
	click(btns[1])
	expect(seen.confirm).toEqual([])
	click(root.querySelector("[data-action=save-list]"))
	expect(seen.confirm).toEqual([lists()[1]])
})

test("closing a row ends its half-done Confirm", () => {
	draw()
	click(head("w1"))
	click(root.querySelector("[data-action=confirm-list]"))
	expect(root.querySelector("[data-action=save-list]")).not.toBeNull()
	click(head("w1"))
	click(head("w1"))
	expect(root.querySelector("[data-action=save-list]")).toBeNull()
	expect(root.querySelector("[data-action=confirm-list]")).not.toBeNull()
})

test("an opened saved list shows made and not made, and Open links its page", () => {
	draw()
	click(head("s1"))
	const open = shown() as HTMLElement
	const lines = [...open.querySelectorAll(".a-part")].map(text)
	expect(lines[0]).toContain("฿90.00")
	expect(lines[1]).toContain("Not made")
	expect(open.querySelector(".a-total")).toBeNull()
	expect(text(open.querySelector(".a-say"))).toBe("Saved. ฿90.00 bought.")
	expect(text(open.querySelector(".a-say .a-money"))).toBe("฿90.00")
	const btns = [...open.querySelectorAll(".a-btns > *")]
	expect(btns.map((b) => b.getAttribute("data-action"))).toEqual(["open"])
	expect(btns[0]?.getAttribute("href")).toBe("/list/view?id=s1")
	expect(text(btns[0])).toBe("Open")
})

test("the view draws no filter controls of its own: the page holds them", () => {
	draw()
	expect(root.querySelector("fieldset.chips, [data-status], input[type=search]")).toBeNull()
})

test("empty names the next step", () => {
	draw({ lists: [] })
	const empty = root.querySelector(".empty")
	expect(empty?.textContent?.trim()).toBe("No lists yet. Start one from Home.")
	expect(empty?.getAttribute("data-refocus")).toBe("lists")
})

test("lists that no filter matches say so instead of asking for a first list", () => {
	const only = lists().filter((l) => l.status === "draft")
	draw({ lists: only, filter: { status: ["saved"] } })
	expect(root.querySelector(".empty")?.textContent?.trim()).toBe("No list matches. Clear a filter to see more.")
	expect(root.querySelector(".empty")?.getAttribute("data-refocus")).toBe("lists")
	expect(root.querySelector("[data-row]")).toBeNull()
})

test("opened lists read in Thai", () => {
	setLocale("th")
	draw()
	click(head("s1"))
	expect(text(shown()?.querySelector(".a-say"))).toBe("บันทึกแล้ว ซื้อไป ฿90.00")
	click(head("w1"))
	expect(text(shown()?.querySelector(".a-say"))).toBe("ส่งเมื่อ 1 พ.ย. กดยืนยันเพื่อบันทึกทุกรายการว่าซื้อแล้ว")
})

/** Opens `id`, focuses its draft's Delete, then repaints without the list, as a delete does. */
const deleteDraft = async (all: PurchaseList[], id: string) => {
	const { set } = draw({ lists: all })
	click(root.querySelector(`[data-row="list:${id}"] button.a-hit`))
	root.querySelector<HTMLElement>(`[data-row="list:${id}"] [data-action="delete-draft"]`)?.focus()
	set(all.filter((l) => l.id !== id))
	await settle()
}

test("when a deleted draft's row goes, focus moves to the next row's head in its section", async () => {
	const d2: PurchaseList = { id: "d2", date: "2026-10-28", status: "draft", lines: [{ cardId: "A", amount: 100_00 }] }
	await deleteDraft([...lists(), d2], "d1")
	expect(root.querySelector('[data-row="list:d1"]')).toBeNull()
	expect(document.activeElement).toBe(root.querySelector('[data-row="list:d2"] button.a-hit'))
})

test("when the last draft goes, focus moves to the next section's heading", async () => {
	await deleteDraft(lists(), "d1")
	expect(root.querySelector('[data-section="draft"]')).toBeNull()
	expect(document.activeElement).toBe(root.querySelector('[data-refocus="lists:sent"]'))
})

test("when the only list goes, focus moves to the empty note", async () => {
	await deleteDraft(lists().slice(0, 1), "d1")
	const empty = root.querySelector<HTMLElement>(".empty")
	expect(empty?.getAttribute("tabindex")).toBe("-1")
	expect(document.activeElement).toBe(empty)
})

// DD-109: a hovered row's ground reaches the panel's inner edges, so the panel clips it at its
// rounded corners.
test("the panel clips the hover ground at its rounded corners", async () => {
	const source = await Bun.file("src/components/organisms/ListIndex.svelte").text()
	expect(source).toMatch(/\.row-panel\s*\{[^}]*overflow: clip/)
})

test("a draft or waiting list with others of its status that day offers Merge, which calls back", () => {
	const all = lists()
	const w2: PurchaseList = { ...(all[1] as PurchaseList), id: "w2" }
	const w3: PurchaseList = { ...(all[1] as PurchaseList), id: "w3" }
	const { seen } = draw({ lists: [...all, w2, w3] })
	click(head("w1"))
	const open = shown() as HTMLElement
	const merge = open.querySelector('[data-action="merge"]')
	expect(merge?.textContent?.trim()).toBe("Merge with 2 other lists")
	expect([...open.querySelectorAll(".a-btns > *")].map((b) => b.getAttribute("data-action"))[1]).toBe("merge")
	click(merge)
	expect(seen.merged.map((l) => l.id)).toEqual(["w1"])
	// The lone draft and the saved list offer none.
	click(head("d1"))
	expect(shown()?.querySelector('[data-action="merge"]')).toBeNull()
	click(head("s1"))
	expect(shown()?.querySelector('[data-action="merge"]')).toBeNull()
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

test("a filtered-out list still counts as a merge partner, since Merge acts on every list that day", () => {
	const all = lists()
	const w2: PurchaseList = { ...(all[1] as PurchaseList), id: "w2", lines: [{ cardId: "B", amount: 1 }] }
	draw({ lists: [...all, w2], filter: { cards: ["A"] } })
	expect(root.querySelector('[data-row="list:w2"]')).toBeNull()
	click(head("w1"))
	expect(text(shown()?.querySelector('[data-action="merge"]'))).toBe("Merge with 1 other list")
})

test("search narrows the rows by card or note", () => {
	draw({ filter: { q: "card b" } })
	expect([...root.querySelectorAll("[data-row]")].map((r) => r.getAttribute("data-row"))).toEqual([
		"list:w1",
		"list:s1",
	])
})
