import type { OwedSort } from "#lib/domain/owed"
import type { PayChoice } from "#lib/domain/pay"
import type { GroupRoom } from "#lib/domain/room"
import type { SortDir } from "#lib/domain/sort"
import type { Card, CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import OwedList from "#components/organisms/OwedList.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * Home's _Owed_ tab (RD-25): its sort, then the pay tiles of the cards that owe, each opening the
 * card's panel over the tab, with _Pay_ on its last line opening the panel on its pay form.
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

const rows = (): PayChoice[] => [
	{
		card: card("A"),
		owed: 500_00,
		credit: 0,
		bill: null,
		urgency: "overdue",
		days: 3,
	} as PayChoice,
	{
		card: card("B.2"),
		owed: 120_00,
		credit: 0,
		bill: null,
		urgency: "due",
		days: 0,
	} as PayChoice,
]

type Props = {
	rows: PayChoice[]
	groups: LimitGroup[]
	rooms: Map<string, GroupRoom>
	ledgers: Map<string, CardLedger>
	today: PlainDate
	sort: OwedSort
	dir: SortDir
	onsort: (sort: OwedSort, dir: SortDir) => void
	current: string | null
	onopencard: (id: string) => void
	onpay: (row: PayChoice) => void
}

const show = (props: Partial<Props> = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(OwedList, {
		target: document.body,
		props: {
			rows: rows(),
			groups: [],
			rooms: new Map(),
			ledgers: new Map(),
			today: "2026-11-04",
			sort: "urgency",
			dir: "asc",
			onsort: () => {},
			...props,
		},
	})
	flushSync()
	return document.body.querySelector(".owed-list") as HTMLElement
}

const flat = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("each tile opens the card's panel over the tab; a plain click opens it in place", () => {
	const opened: string[] = []
	const root = show({ onopencard: (id) => opened.push(id) })
	const links = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[data-card]"))
	expect(links.map((link) => link.getAttribute("href"))).toEqual(["/owed?card=A", "/owed?card=B.2"])
	expect(links[0]?.textContent).toContain("฿500.00")
	expect(links[0]?.textContent).toContain("Overdue 3 days")
	expect(links[0]?.querySelector("[data-numeric]")).not.toBeNull()
	const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })
	links[1]?.dispatchEvent(click)
	expect(click.defaultPrevented).toBe(true)
	expect(opened).toEqual(["B.2"])
	// A click asking for a new tab is the browser's.
	const tab = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, metaKey: true })
	links[0]?.dispatchEvent(tab)
	expect(tab.defaultPrevented).toBe(false)
	expect(opened).toEqual(["B.2"])
})

test("the open card's tile is marked", () => {
	const root = show({ current: "A" })
	expect(root.querySelector('a[data-card="A"]')?.getAttribute("aria-current")).toBe("true")
	expect(root.querySelector('a[data-card="B.2"]')?.hasAttribute("aria-current")).toBe(false)
})

test("Pay sits on each tile's last line, outside its link, and hands over the row", () => {
	const paid: string[] = []
	const root = show({ onpay: (row) => paid.push(row.card.id) })
	const pays = [...root.querySelectorAll<HTMLButtonElement>('.tile-box [data-action="pay"]')]
	expect(pays).toHaveLength(2)
	expect(pays.every((b) => b.closest("a") === null)).toBe(true)
	expect(pays[0]?.getAttribute("type")).toBe("button")
	expect(flat(pays[0])).toBe("Pay")
	expect(pays[0]?.getAttribute("aria-label")).toBe("Pay ฿500.00, A) Card A")
	pays[1]?.click()
	expect(paid).toEqual(["B.2"])
})

test("the sort row calls onsort with the chosen sort, in its own direction, and marks the order", () => {
	const sorts: [OwedSort, SortDir][] = []
	const root = show({ sort: "left", dir: "desc", onsort: (sort, dir) => sorts.push([sort, dir]) })
	const select = root.querySelector(".sort-bar select[name=sort]") as HTMLSelectElement
	expect(Array.from(select.options).map((o) => o.value)).toEqual(["urgency", "card", "due", "left"])
	expect(select.value).toBe("left")
	expect(root.querySelector("label.chip")?.hasAttribute("data-active")).toBe(true)
	select.value = "due"
	select.dispatchEvent(new Event("change", { bubbles: true }))
	root.querySelector<HTMLButtonElement>('.filter-seg [data-dir="asc"]')?.click()
	expect(sorts).toEqual([
		["due", "asc"],
		["left", "asc"],
	])
})

test("empty says nothing is owed, with no sort chip", () => {
	const root = show({ rows: [] })
	expect(root.querySelector(".empty")?.textContent?.trim()).toBe("Nothing owed on any card.")
	expect(root.querySelector(".sort-bar")).toBeNull()
	expect(root.querySelector(".tiles")).toBeNull()
})

test("draws each card as a wallet tile, with no heading (the tab names it)", () => {
	const root = show({
		groups: [{ id: "g1", name: "One", limit: 1_000_00, color: "blue" }],
		rooms: new Map([
			[
				"g1",
				{
					group: { id: "g1", name: "One", limit: 1_000_00, color: "blue" },
					used: 250_00,
					available: 750_00,
					held: 0,
					room: 750_00,
					level: "within",
					sharedWith: 0,
				},
			],
		]),
		today: "2026-11-04",
		rows: rows().map((r, i) =>
			i === 0
				? {
						...r,
						card: { ...r.card, limitGroupId: "g1" },
						bill: {
							period: "2026-09",
							cardId: "A",
							closeDate: "2026-09-18",
							dueDate: "2026-10-03",
							total: 500_00,
							paidAmount: 0,
							remaining: 500_00,
							parts: [],
							open: false,
						},
					}
				: r,
		) as PayChoice[],
	})
	expect(root.querySelector("h2")).toBeNull()
	expect(root.querySelector(".panel")).toBeNull()
	expect(root.querySelector(".row-panel")).toBeNull()
	expect(root.querySelectorAll(".tiles")).toHaveLength(1)
	const [a, b] = Array.from(root.querySelectorAll<HTMLAnchorElement>(".tiles a.tile[data-card]"))
	expect(flat(a?.querySelector(".name"))).toBe("A) Card A")
	expect(flat(a?.querySelector(".corner"))).toBe("•••• 1111")
	expect(a?.getAttribute("data-g")).toBe("blue")
	expect(flat(a?.querySelector(".room"))).toBe("฿500.00 owed")
	expect(flat(a?.querySelector(".aside"))).toBe("Overdue 3 days")
	expect(a?.querySelector(".aside")?.getAttribute("data-tone")).toBe("bad")
	expect(flat(a?.querySelector(".facts"))).toBe("Bill closed 18 Sep 2026 · ฿500.00 left")
	expect(a?.querySelector(".rail")?.getAttribute("aria-label")).toBe("25% of the limit used")
	expect(a?.getAttribute("aria-label")).toBe("Card A, ฿500.00 owed")
	expect(flat(b?.querySelector(".room"))).toBe("฿120.00 owed")
	expect(flat(b?.querySelector(".facts"))).toBe("closes 18 Nov 2026 · due 03 Dec 2026")
	expect(b?.hasAttribute("data-g")).toBe(false)
	expect(b?.querySelector(".rail")).toBeNull()
})

test("Pay follows a switch of language", () => {
	const root = show()
	setLocale("th")
	flushSync()
	expect(flat(root.querySelector('[data-action="pay"]'))).toBe("ชำระ")
})

test("the tiles fill the width: one column on a phone, as many as fit from 900px", async () => {
	const source = await Bun.file("src/components/organisms/OwedList.svelte").text()
	expect(source).toMatch(/\.tiles\s*\{[^}]*display: grid/)
	expect(source).toMatch(
		/@media \(min-width: 900px\)\s*\{\s*\.owed-list \.tiles\s*\{\s*grid-template-columns: repeat\(auto-fill, minmax\(var\(--cc-tile-min\), 1fr\)\)/,
	)
})
