import type { Sectioned } from "#lib/domain/cards-view"
import type { PayChoice } from "#lib/domain/pay"
import type { GroupRoom } from "#lib/domain/room"
import type { Card, CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import OwedList from "#components/organisms/OwedList.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * Home's _Owed_ tab (RD-25): the pay tiles of the cards that owe, each opening the
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
	/** The rows on show, flat; `show` passes them as results. */
	rows: PayChoice[]
	sections: Sectioned<PayChoice>["sections"]
	total: number
	groups: LimitGroup[]
	rooms: Map<string, GroupRoom>
	ledgers: Map<string, CardLedger>
	today: PlainDate
	current: string | null
	onopencard: (id: string) => void
	onpay: (row: PayChoice) => void
}

const show = ({ rows: list = rows(), sections = null, total, ...props }: Partial<Props> = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const count = sections ? sections.reduce((n, s) => n + s.cards.length, 0) : list.length
	mounted = mount(OwedList, {
		target: document.body,
		props: {
			results: { sections, flat: sections ? null : list, count },
			total: total ?? count,
			groups: [],
			rooms: new Map(),
			ledgers: new Map(),
			today: "2026-11-04",
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

test("empty says nothing is owed", () => {
	const root = show({ rows: [] })
	expect(root.querySelector(".empty")?.textContent?.trim()).toBe("Nothing owed on any card.")
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

test("nothing matching the filters says so, as on Cards", () => {
	const root = show({ rows: [], total: 2 })
	expect(root.querySelector(".empty")?.textContent?.trim()).toBe("No card matches. Clear the search or a filter.")
})

test("grouped, the tiles sit in Cards' sections, each headed by its name and count", () => {
	const [a, b] = rows()
	if (!a || !b) throw new Error("no rows")
	const root = show({
		locations: [{ id: "krabi", name: "Krabi", takesPurchases: true }],
		sections: [
			{ key: "holder:KC", kind: "holder", owner: "KC", cards: [b] },
			{ key: "holder:RI", kind: "holder", owner: "RI", cards: [a] },
		],
	} as Partial<Props>)
	expect([...root.querySelectorAll("section[data-section]")].map((el) => flat(el.querySelector("h2")))).toEqual([
		"KC 1 card",
		"RI 1 card",
	])
	expect(root.querySelectorAll('section[data-section] [data-action="pay"]')).toHaveLength(2)
})
