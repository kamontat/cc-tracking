import type { Card, LimitGroup, Purchase } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import ListCardPicker from "#components/organisms/ListCardPicker.svelte"
import { readyRows } from "#lib/domain/home"
import { cardLedger } from "#lib/domain/ledger"
import { cardUsage } from "#lib/domain/usage"
import { setLocale } from "#lib/i18n/index"

/**
 * The add-a-card sheet's picker (DD-195): a search, the sorts as pills, and every ready card as
 * a tile with its last 12 statements under it. A tap picks the card; a card already on the list
 * says so, with its amount.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const TODAY = "2026-11-11"

const card = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: `Card ${id}`,
	last4: `${id}000`.slice(0, 4),
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
})

const buy = (cardId: string, date: string, amount: number): Purchase => ({
	id: `${cardId}-${date}`,
	cardId,
	date,
	amount,
	note: "",
})

const groups: LimitGroup[] = [
	{ id: "g1", name: "SCB", limit: 100_000_00, owner: "KC", color: "blue" },
	{ id: "g2", name: "UOB", limit: 50_000_00, owner: "NT", color: "teal" },
]
const cards = [card("1"), card("2", { limitGroupId: "g2", name: "UOB Krabi" }), card("3")]
const purchases = [buy("1", "2026-11-03", 5_000_00), buy("2", "2026-06-01", 2_000_00)]
const ledgers = new Map(cards.map((c) => [c.id, cardLedger(c, purchases, [], [], TODAY)]))
const rows = readyRows(
	{ cards, groups, ledgers, lists: [], locations: [{ id: "krabi", name: "Krabi", takesPurchases: true }] },
	TODAY,
)
const usage = new Map(cards.map((c) => [c.id, cardUsage(c, ledgers.get(c.id), TODAY)]))

const show = (props: Record<string, unknown> = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const picks: string[] = []
	mounted = mount(ListCardPicker, {
		target: document.body,
		props: { rows, usage, groups, onList: new Map(), onpick: (id: string) => picks.push(id), ...props } as never,
	})
	flushSync()
	return picks
}

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const order = () => [...document.querySelectorAll(".tile")].map((el) => el.getAttribute("data-card"))

const type = (value: string) => {
	const input = $<HTMLInputElement>('[data-field="search"]')
	if (!input) throw new Error("no search")
	input.value = value
	input.dispatchEvent(new Event("input", { bubbles: true }))
	flushSync()
}

const sortBy = (sort: string) => {
	$<HTMLButtonElement>(`[data-sort="${sort}"]`)?.click()
	flushSync()
}

test("every ready card as a tile, most room first, with its last 12 statements under it", () => {
	show()
	// Cards 1 and 3 share SCB (100,000 less 5,000); card 2 has UOB (50,000 less 2,000).
	expect(order()).toEqual(["1", "3", "2"])
	const first = $('.tile[data-card="1"]')
	expect(first?.querySelectorAll(".spark i")).toHaveLength(12)
	expect(text(first?.querySelector(".foot"))).toBe("฿5,000.00 in 12 statements · last used 3 Nov")
	expect(text($('.tile[data-card="3"] .foot'))).toBe("Not used in 12 statements")
	expect(text($('.tile[data-card="1"] .facts'))).toBe("closes 25 Nov · due 15 Dec")
})

test("the sorts are pills, room picked first; each reorders the tiles", () => {
	show()
	const pills = [...document.querySelectorAll("[data-sort]")]
	expect(pills.map(text)).toEqual(["Most room", "Least used", "Longest unused", "Longest to close", "Latest due"])
	expect(pills.map((p) => p.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false", "false"])
	sortBy("least")
	expect(order()).toEqual(["3", "2", "1"])
	expect($('[data-sort="least"]')?.getAttribute("aria-pressed")).toBe("true")
	sortBy("idle")
	expect(order()).toEqual(["3", "2", "1"])
})

test("the search narrows the tiles, and a search that finds nothing says so", () => {
	show()
	type("uob")
	expect(order()).toEqual(["2"])
	type("zzz")
	expect(order()).toEqual([])
	expect(text($('[data-empty="no-match"]'))).toBe("No card matches.")
})

test("a tap picks the card", () => {
	const picks = show()
	$<HTMLButtonElement>('.tile[data-card="2"]')?.click()
	expect(picks).toEqual(["2"])
})

test("a card on the list says so, with its amount and its orders when more than one", () => {
	show({
		onList: new Map([
			["1", { amount: 1_500_00, orders: 2 }],
			["3", { amount: 0, orders: 1 }],
		]),
	})
	expect(text($('.tile[data-card="1"] .aside'))).toBe("On the list · ฿1,500.00 · 2 orders")
	expect(text($('.tile[data-card="3"] .aside'))).toBe("On the list")
	expect($('.tile[data-card="2"] .aside')).toBeNull()
})

test("with no ready card it says why and leads to Locations", () => {
	show({ rows: [] })
	expect(text($('[data-empty="none"]'))).toContain("No card can be used right now")
	expect($('[data-empty="none"] a')?.getAttribute("href")).toBe("/settings/locations")
})

test("reads in Thai", () => {
	setLocale("th")
	show()
	expect(text($('[data-sort="room"]'))).toBe("วงเงินเหลือมากสุด")
	expect(text($('.tile[data-card="3"] .foot'))).toBe("ไม่ได้ใช้ใน 12 รอบบิล")
})
