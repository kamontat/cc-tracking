import type { Card, LimitGroup } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import LimitsPage from "#components/organisms/LimitsPage.svelte"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository } from "#lib/storage/repository"
import { seedLocations } from "#lib/storage/seed-locations"
import { fakeHistory } from "../../lib/ui/fake-history"

/**
 * The Limits tab (`/cards/limits`, RD-22): every limit group with its search, filter and sort in
 * the address, a group opening in its panel (`?limit=`), and a group's card in the card's panel.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const settle = async (rounds = 20) => {
	for (let i = 0; i < rounds; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)

const KBANK: LimitGroup = { id: "g1", name: "KBank", limit: 100_000_00, owner: "KC" }
const SCB: LimitGroup = { id: "g2", name: "SCB", limit: 50_000_00, owner: "NT" }
const AMEX: LimitGroup = { id: "g3", name: "Amex", limit: 80_000_00, owner: "RI" }

const card = (id: string, name: string, limitGroupId: string): Card => ({
	id,
	name,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId,
})

const setup = async (start = "/cards/limits", repo?: InMemoryRepository) => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	const store = repo ?? new InMemoryRepository()
	if (!repo) {
		await seedLocations(store, { getItem: () => null, setItem: () => {} })
		for (const group of [KBANK, SCB, AMEX]) await store.saveLimitGroup(group)
		await store.saveCard(card("7", "Titanium", "g1"))
		await store.saveCard(card("12.3", "Platinum", "g2"))
	}
	const history = fakeHistory(start)
	let ids = 0
	mounted = mount(LimitsPage, {
		target: document.body,
		props: {
			open: async () => ({ ok: true as const, repo: store }),
			clock: () => new Date("2026-10-31T03:00:00Z"),
			address: history.bar,
			newId: () => `new-${++ids}`,
		},
	})
	await settle()
	return { history, repo: store }
}

const groups = () => [...document.querySelectorAll(".gpanel")].map((el) => el.getAttribute("data-group"))

const search = async (value: string) => {
	const input = $<HTMLInputElement>(".tx-search input")
	if (!input) throw new Error("no search")
	input.value = value
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

const press = async (selector: string) => {
	const target = $(selector)
	if (!target) throw new Error(`no ${selector}`)
	target.click()
	await settle()
}

test("every group, A to Z, under the search row with Filter, the sort chip and + Add limit at its end", async () => {
	await setup()
	expect(groups()).toEqual(["g3", "g1", "g2"])
	expect($<HTMLInputElement>(".tx-search input")?.placeholder).toBe("Search limits")
	const row = [...($(".tx-ctl")?.children ?? [])].map((el) => el.getAttribute("data-action") ?? el.tagName)
	expect(row).toEqual(["LABEL", "filter", "add-limit"])
	expect($('[data-action="add-limit"]')?.getAttribute("data-variant")).toBe("quiet")
	expect(text($('[data-action="add-limit"]'))).toBe("Add limit")
	expect(text($('[data-action="sort"]'))).toContain("A to Z")
	expect($('[data-action="group"]')).toBeNull()
})

test("the address's q, f.owners, sort and dir shape the list", async () => {
	await setup("/cards/limits?q=titan")
	expect(groups()).toEqual(["g1"])
	await setup("/cards/limits?f.owners=NT&f.owners=RI")
	expect(groups()).toEqual(["g3", "g2"])
	expect([...document.querySelectorAll("[data-chip]")].map((el) => el.getAttribute("data-chip"))).toEqual([
		"owner:NT",
		"owner:RI",
	])
	await setup("/cards/limits?sort=room")
	expect(groups()).toEqual(["g1", "g3", "g2"])
	expect(text($('[data-action="sort"]'))).toContain("Most room")
})

test("searching rewrites the address in place, keeping the open group", async () => {
	const { history } = await setup("/cards/limits?limit=g1")
	await search("kb")
	expect(history.now()).toBe("/cards/limits?q=kb&limit=g1")
	expect(history.size()).toBe(1)
	expect(groups()).toEqual(["g1"])
	await search("")
	expect(history.now()).toBe("/cards/limits?limit=g1")
})

test("a chip clears its filter from the address", async () => {
	const { history } = await setup("/cards/limits?f.owners=NT&sort=used")
	await press('[data-chip="owner:NT"]')
	expect(history.now()).toBe("/cards/limits?sort=used")
	// None used yet, so the tie falls back to A to Z.
	expect(groups()).toEqual(["g3", "g1", "g2"])
})

test("nothing matches says so; no group at all says how to add one", async () => {
	await setup("/cards/limits?q=zzz")
	expect(text($(".group-panels .empty"))).toBe("No limit matches. Clear the search or a filter.")
	const empty = new InMemoryRepository()
	await seedLocations(empty, { getItem: () => null, setItem: () => {} })
	await setup("/cards/limits", empty)
	expect(text($(".group-panels .empty"))).toBe("No limit groups yet. Add one with Add limit.")
})

test("a group opens in its panel, pushing ?limit=, marked in the list; Back closes it", async () => {
	const { history } = await setup("/cards/limits?sort=room")
	await press('.gpanel[data-group="g2"]')
	expect(history.now()).toBe("/cards/limits?sort=room&limit=g2")
	expect(history.size()).toBe(2)
	expect(text($(".detail-panel__head h2"))).toBe("SCB")
	expect($(".panel-layout")?.hasAttribute("data-panel")).toBe(true)
	expect($('.gpanel[data-group="g2"]')?.getAttribute("aria-current")).toBe("true")
	await press('.gpanel[data-group="g1"]')
	expect(history.now()).toBe("/cards/limits?sort=room&limit=g1")
	expect(history.size()).toBe(2)
	history.userBack()
	await settle()
	expect($(".detail-panel")).toBeNull()
	expect($(".panel-layout")?.hasAttribute("data-panel")).toBe(false)
})

test("a group's card opens the card's panel a step deeper; Back returns to the group", async () => {
	const { history } = await setup("/cards/limits?limit=g1")
	await press('.limit-detail [data-card="7"]')
	expect(history.now()).toBe("/cards/limits?card=7")
	expect(text($(".detail-panel__head h2"))).toContain("Titanium")
	expect($(".limit-detail")).toBeNull()
	history.userBack()
	await settle()
	expect(text($(".detail-panel__head h2"))).toBe("KBank")
})

test("+ Add limit opens a blank form with the address unchanged; adding lists it and opens it", async () => {
	const { history, repo } = await setup("/cards/limits")
	await press('[data-action="add-limit"]')
	expect(history.now()).toBe("/cards/limits")
	expect(text($(".detail-panel__head h2"))).toBe("New limit")
	const type = async (name: string, value: string) => {
		const input = $<HTMLInputElement>(`.detail-panel [name="${name}"]`)
		if (!input) throw new Error(`no ${name}`)
		input.value = value
		input.dispatchEvent(new Event("input", { bubbles: true }))
		await settle()
	}
	await type("name", "Bangkok Bank")
	await type("limit", "1000")
	await press('.detail-panel [data-owner="KC"]')
	$(".detail-panel form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
	expect((await repo.listLimitGroups()).some((g) => g.id === "new-1")).toBe(true)
	expect(history.now()).toBe("/cards/limits?limit=new-1")
	expect(groups()).toContain("new-1")
	expect(text($(".detail-panel__head h2"))).toBe("Bangkok Bank")
})

test("a pasted ?card= opens the card's panel on Limits", async () => {
	await setup("/cards/limits?card=12.3")
	expect(text($(".detail-panel__head h2"))).toContain("Platinum")
})

test("Back and Forward re-read the list's settings", async () => {
	const { history } = await setup("/cards/limits?q=kb")
	await press('.gpanel[data-group="g1"]')
	history.bar.replace("/cards/limits?q=scb&limit=g1")
	history.userBack()
	await settle()
	history.userForward()
	await settle()
	expect($<HTMLInputElement>(".tx-search input")?.value).toBe("scb")
	expect(groups()).toEqual(["g2"])
})

test("follows a language switch", async () => {
	await setup()
	setLocale("th")
	await settle()
	expect(text($('[data-action="add-limit"]'))).not.toBe("Add limit")
})
