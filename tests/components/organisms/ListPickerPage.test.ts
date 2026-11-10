import type { Card } from "#lib/domain/types"

import { afterEach, expect, test } from "vitest"

import ListNewPage from "#components/organisms/ListNewPage.svelte"
import ListPickerPage from "#components/organisms/ListPickerPage.svelte"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { card, cleanup, fakeBar, saveLocations, settle, setupPage } from "./list-support"

/**
 * The new-list picker (`/list/new`, DD-103). Ported from the legacy `picker-page` tests; where
 * those read the picker and sheet elements' properties, these read and drive what they draw.
 */
afterEach(cleanup)

/** Four ready cards over two groups and two places, one archived and one in no place. */
const seedPicker = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00, owner: "KC" })
	await repo.saveLimitGroup({ id: "g2", name: "G2", limit: 50_000_00, owner: "NT" })
	await repo.saveCard(card("A"))
	await repo.saveCard(card("B", { name: "UOB Krabi", limitGroupId: "g2" }))
	await repo.saveCard(card("C", { location: "bangkok", last4: "9876" }))
	await repo.saveCard(card("D", { location: "bangkok", limitGroupId: "g2" }))
	await repo.saveCard(card("E", { location: "phichit" }))
	await repo.saveCard(card("Z", { archived: true }))
	await saveLocations(repo, ["krabi", "bangkok"])
	// Room: g1 has two cards spending 30k, g2 two cards spending 10k.
	await repo.savePurchase({ id: "p1", cardId: "A", date: "2026-10-28", amount: 30_000_00, note: "" })
	await repo.savePurchase({ id: "p2", cardId: "B", date: "2026-10-28", amount: 10_000_00, note: "" })
}

const setup = async (search = "", before?: (repo: Repository) => Promise<void>, repo?: Repository) => {
	const page = await setupPage(ListPickerPage, {
		search,
		...(repo ? { repo } : {}),
		before: async (r) => {
			await seedPicker(r)
			await before?.(r)
		},
	})
	return { ...page, addresses: page.replaced }
}

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)
const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim()

/** The picker's tiles, in order. */
const order = () => [...document.querySelectorAll(".tiles [data-card]")].map((el) => el.getAttribute("data-card"))
const pressed = () =>
	[...document.querySelectorAll('.tiles [data-card][aria-pressed="true"]')].map((el) => el.getAttribute("data-card"))
const toggle = async (cardId: string) => {
	$(`.tiles [data-card="${cardId}"]`)?.click()
	await settle()
}
const bar = () => $('[data-testid="selection"]')
const press = async (selector: string) => {
	const el = $(selector)
	if (!el) throw new Error(`no ${selector}`)
	el.click()
	await settle()
}
/** Lets a sheet's exit play out; `afterExit` waits on the animation or a timer. */
const exit = async () => {
	await new Promise((resolve) => setTimeout(resolve, 450))
	await settle()
}

test("a list page under a sub-header to Home, with the ready cards by most room", async () => {
	await setup()
	expect(flat($(".sub-header h1"))).toBe("New purchase list 4 cards in Bangkok, Krabi")
	expect($('.sub-header [data-action="back"]')?.getAttribute("href")).toBe("/")
	expect(order()).toEqual(["A", "C", "B", "D"])
	expect(flat($('[data-action="sort"]'))).toBe("Sort: Most room ▾")
	expect(flat($('[data-action="group"]'))).toBe("Group: None ▾")
	expect($(".tx-count")).toBeNull()
	expect($("[data-chip]")).toBeNull()
})

test("ticking cards shows the selection bar; Enter amounts opens them in tap order", async () => {
	const { visited } = await setup()
	expect(bar()).toBeNull()
	await toggle("C")
	expect(flat(bar()?.querySelector("b"))).toBe("1 card selected")
	await toggle("A")
	expect(flat(bar()?.querySelector("b"))).toBe("2 cards selected")
	expect(pressed().sort()).toEqual(["A", "C"])
	bar()?.querySelector<HTMLElement>('[data-action="enter-amounts"]')?.click()
	expect(visited).toEqual(["/list/new?card=C&card=A"])
})

test("ticking twice or Clear takes the pick back off", async () => {
	await setup()
	await toggle("A")
	await toggle("A")
	expect(bar()).toBeNull()
	await toggle("A")
	await toggle("B")
	await press('[data-testid="selection"] [data-action="clear"]')
	expect(bar()).toBeNull()
	expect(pressed()).toEqual([])
})

test("the search narrows the rows and is kept in the address", async () => {
	const { addresses } = await setup()
	const input = $<HTMLInputElement>('.tx-search input[name="q"]')
	if (!input) throw new Error("no search")
	input.value = "uob"
	input.dispatchEvent(new Event("input"))
	await settle()
	expect(order()).toEqual(["B"])
	expect(addresses.at(-1)).toBe("/list/new?q=uob")
	input.value = "9876"
	input.dispatchEvent(new Event("input"))
	await settle()
	expect(order()).toEqual(["C"])
})

test("the filter sheet offers the ready cards' places and holders and applies with the sort", async () => {
	const { addresses } = await setup()
	await press('[data-action="filter"]')
	const offered = (kind: string) =>
		[...document.querySelectorAll(`dialog [data-${kind}]`)].map((el) => el.getAttribute(`data-${kind}`))
	expect(offered("location")).toEqual(["bangkok", "krabi"])
	expect(offered("owner")).toEqual(["KC", "NT"])
	await press("dialog [data-location=bangkok]")
	await press("dialog [data-owner=NT]")
	await press("dialog [data-sort=due]")
	expect(flat($("dialog [data-action=apply]"))).toBe("Show 1 card")
	await press("dialog [data-action=apply]")
	await exit()
	expect($("dialog")).toBeNull()
	expect(order()).toEqual(["D"])
	expect(addresses.at(-1)).toBe("/list/new?loc=bangkok&owner=NT&sort=due")
	expect(flat($(".tx-count"))).toBe("2")
	expect(flat($('[data-action="sort"]'))).toBe("Sort: Latest due ▾")
	expect([...document.querySelectorAll("[data-chip]")].map((c) => flat(c))).toEqual(["Bangkok ×", "NT ×"])
	await press('[data-chip="owner:NT"]')
	expect(order()).toEqual(["C", "D"])
	expect(addresses.at(-1)).toBe("/list/new?loc=bangkok&sort=due")
})

test("the sort chip opens the sheet, and closing it changes nothing", async () => {
	const { addresses } = await setup()
	await press('[data-action="sort"]')
	await press("dialog [data-sort=close]")
	await press('dialog [data-action="close"]')
	await exit()
	expect($("dialog")).toBeNull()
	expect(addresses).toEqual([])
	expect(order()).toEqual(["A", "C", "B", "D"])
})

test("the address restores the search, filters and sort", async () => {
	await setup("?loc=krabi&sort=close")
	expect(order()).toEqual(["A", "B"])
	expect(flat($('[data-action="sort"]'))).toBe("Sort: Longest to close ▾")
	expect(flat($('[data-chip="location:krabi"]'))).toBe("Krabi ×")
})

test("by place or holder, the cards sit in headed sections, keeping the sort inside each", async () => {
	await setup("?by=place")
	const sections = () => [...document.querySelectorAll("section[data-section]")]
	expect(sections().map((s) => s.getAttribute("data-section"))).toEqual(["place:bangkok", "place:krabi"])
	expect(sections().map((s) => flat(s.querySelector("h2")))).toEqual(["Bangkok 2 cards", "Krabi 2 cards"])
	expect(order()).toEqual(["C", "D", "A", "B"])
	expect(flat($('[data-action="group"]'))).toBe("Group: Place ▾")
	cleanup()
	await setup("?by=holder")
	expect(sections().map((s) => flat(s.querySelector("h2")))).toEqual(["KC 2 cards", "NT 2 cards"])
	expect(order()).toEqual(["A", "C", "B", "D"])
})

test("the sheet's Group by is kept in the address", async () => {
	const { addresses } = await setup()
	expect($("section[data-section]")).toBeNull()
	await press('[data-action="group"]')
	await press('dialog [data-by="holder"]')
	await press('dialog [data-action="apply"]')
	await exit()
	expect(addresses.at(-1)).toBe("/list/new?by=holder")
	expect(document.querySelectorAll("section[data-section]")).toHaveLength(2)
})

test("a custom place in the address filters, is offered by name and chipped by name", async () => {
	await setup("?loc=chiang-mai&loc=mars", async (repo) => {
		await repo.saveLocation({ id: "chiang-mai", name: "Chiang Mai", takesPurchases: true })
		await repo.saveCard(card("F", { location: "chiang-mai" }))
	})
	expect(order()).toEqual(["F"])
	expect([...document.querySelectorAll("[data-chip]")].map((c) => flat(c))).toEqual(["Chiang Mai ×"])
	await press('[data-action="filter"]')
	expect(
		[...document.querySelectorAll("dialog [data-location]")].map((el) => el.getAttribute("data-location")),
	).toEqual(["bangkok", "chiang-mai", "krabi"])
	expect(flat($("dialog [data-location=chiang-mai]"))).toBe("Chiang Mai")
})

test("a filter that matches nothing says so and clears", async () => {
	const { addresses } = await setup("?q=nothing&owner=NT")
	expect($(".tiles")).toBeNull()
	expect(flat($('[data-empty="no-match"]'))).toContain("No card matches.")
	await press('[data-action="clear-filters"]')
	expect(order()).toEqual(["A", "C", "B", "D"])
	expect(addresses.at(-1)).toBe("/list/new")
})

test("nothing ready names the next step", async () => {
	await setup("", async (repo) => {
		await saveLocations(repo, [])
	})
	expect($(".tiles")).toBeNull()
	expect($(".tx-controls")).toBeNull()
	expect($('[data-action="settings"]')?.getAttribute("href")).toBe("/settings/locations")
	expect($(".sub-header small")).toBeNull()
})

test("cards with no limit group are counted, with the way to assign them", async () => {
	await setup("", async (repo) => {
		const { limitGroupId: _, ...loose } = card("N")
		await repo.saveCard(loose)
	})
	expect(flat($('[data-testid="unassigned"]'))).toBe("1 card has no limit group yet. Assign them")
	expect($('[data-testid="unassigned"] a')?.getAttribute("href")).toBe("/cards?ungrouped=1")
})

test("reads in Thai", async () => {
	await setup()
	setLocale("th")
	await settle()
	expect(flat($('[data-action="sort"]'))).toBe("เรียง: วงเงินเหลือมากสุด ▾")
	await toggle("A")
	expect(flat(bar()?.querySelector("b"))).toBe("เลือกแล้ว 1 ใบ")
})

class FailingReadRepository extends InMemoryRepository {
	override listCards(): Promise<Card[]> {
		return Promise.reject(new Error("disk is gone"))
	}
}

test("a failed read shows the banner", async () => {
	await setup("", undefined, new FailingReadRepository())
	expect(flat($(".error-banner p"))?.startsWith("Could not read your cards.")).toBe(true)
})

test("/list/new is the picker with no card, and enters amounts with one", async () => {
	await setupPage(ListNewPage, { search: "" })
	expect($(".tx-controls")).not.toBeNull()
	expect($('[data-field="amount"]')).toBeNull()
	await setupPage(ListNewPage, { search: "?card=A", props: { share: {}, address: fakeBar("?card=A").bar } })
	expect($('.line[data-card="A"] [data-field="amount"]')).not.toBeNull()
})
