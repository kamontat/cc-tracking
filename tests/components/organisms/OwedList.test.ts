import type { PayChoice } from "#lib/domain/pay"
import type { GroupRoom } from "#lib/domain/room"
import type { OwedSort } from "#lib/domain/transactions"
import type { Card, CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import OwedList from "#components/organisms/OwedList.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * "Owed on each card": a heading with its sort chip, then one column of pay tiles, each a link
 * to the payment sheet on its card. Ported from the legacy `cc-owed-list` tests.
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
		card: card("B/2"),
		owed: 0,
		credit: 120_00,
		bill: null,
		urgency: "none",
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
	onsort: (sort: OwedSort) => void
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
			onsort: () => {},
			...props,
		},
	})
	flushSync()
	return document.body.querySelector(".owed-list") as HTMLElement
}

const flat = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("each row leads to the payment sheet on its card", () => {
	const root = show()
	const links = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[data-card]"))
	expect(links.map((link) => link.getAttribute("href"))).toEqual(["/pay?card=A", "/pay?card=B%2F2"])
	expect(links[0]?.textContent).toContain("฿500.00")
	expect(links[0]?.textContent).toContain("Overdue 3 days")
	expect(links[1]?.textContent).toContain("Credit ฿120.00")
	expect(links[0]?.querySelector("[data-numeric]")).not.toBeNull()
})

test("the sort chip calls onsort with the chosen sort", () => {
	const sorts: OwedSort[] = []
	const root = show({ onsort: (sort) => sorts.push(sort) })
	const chip = root.querySelector("label.chip") as HTMLElement
	expect(chip.hasAttribute("data-active")).toBe(false)
	expect(flat(chip).startsWith("Sort")).toBe(true)
	const select = root.querySelector("select[name=sort]") as HTMLSelectElement
	expect(Array.from(select.options).map((o) => o.value)).toEqual(["urgency", "card", "due", "left"])
	expect(select.value).toBe("urgency")
	select.value = "left"
	select.dispatchEvent(new Event("change", { bubbles: true }))
	expect(sorts).toEqual(["left"])
})

test("a sort other than urgency marks the chip active and selects it", () => {
	const root = show({ sort: "due" })
	expect(root.querySelector("label.chip")?.hasAttribute("data-active")).toBe(true)
	expect((root.querySelector("select[name=sort]") as HTMLSelectElement).value).toBe("due")
})

test("empty says nothing is owed, with no sort chip", () => {
	const root = show({ rows: [] })
	expect(root.querySelector(".empty")?.textContent?.trim()).toBe("Nothing owed on any card.")
	expect(root.querySelector("select[name=sort]")).toBeNull()
	expect(root.querySelector(".tiles")).toBeNull()
})

test("heads the list and draws each card as a wallet tile in one column", () => {
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
	expect(root.querySelector("h2")?.textContent).toBe("Owed on each card")
	expect(root.querySelector(".panel")).toBeNull()
	expect(root.querySelector(".row-panel")).toBeNull()
	expect(root.querySelectorAll(".tiles")).toHaveLength(1)
	const [a, b] = Array.from(root.querySelectorAll<HTMLAnchorElement>(".tiles > a.tile[data-card]"))
	expect(flat(a?.querySelector(".name"))).toBe("A) Card A")
	expect(flat(a?.querySelector(".corner"))).toBe("•••• 1111")
	expect(a?.getAttribute("data-g")).toBe("blue")
	expect(flat(a?.querySelector(".room"))).toBe("฿500.00 owed")
	expect(flat(a?.querySelector(".aside"))).toBe("Overdue 3 days")
	expect(a?.querySelector(".aside")?.getAttribute("data-tone")).toBe("bad")
	expect(flat(a?.querySelector(".facts"))).toBe("Bill closed 18 Sep 2026 · ฿500.00 left")
	expect(a?.querySelector(".rail")?.getAttribute("aria-label")).toBe("25% of the limit used")
	expect(a?.getAttribute("aria-label")).toBe("Card A, ฿500.00 owed")
	expect(flat(b?.querySelector(".room"))).toBe("Credit ฿120.00")
	expect(flat(b?.querySelector(".facts"))).toBe("closes 18 Nov 2026 · due 03 Dec 2026")
	expect(b?.hasAttribute("data-g")).toBe(false)
	expect(b?.querySelector(".rail")).toBeNull()
})

test("the heading follows a switch of language", () => {
	const root = show()
	setLocale("th")
	flushSync()
	expect(root.querySelector("h2")?.textContent).not.toBe("Owed on each card")
})

test("the tiles sit in a single column", async () => {
	const source = await Bun.file("src/components/organisms/OwedList.svelte").text()
	expect(source).toMatch(/\.tiles\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
})

// The legacy shadow root painted every select's chevron (`controls`); in the light DOM the sort
// chip's select paints its own, with a token gutter, as the card form's selects do.
test("the sort chip's select paints its own chevron", async () => {
	const source = await Bun.file("src/components/organisms/OwedList.svelte").text()
	expect(source).toMatch(/\.chip select\s*\{[^}]*appearance: none/)
	expect(source).toMatch(/\.chip select\s*\{[^}]*background-image: var\(--cc-select-chevron\)/)
	expect(source).toMatch(
		/\.chip select\s*\{[^}]*padding-inline-end: calc\(var\(--cc-space-3\) \* 2 \+ var\(--cc-select-chevron-size\)\)/,
	)
})
