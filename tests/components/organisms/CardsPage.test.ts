import type { Card, LimitGroup } from "#lib/domain/types"
import type { AddressBar } from "#lib/ui/address-bar"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, describe, expect, test } from "vitest"

import CardsPage from "#components/organisms/CardsPage.svelte"
import { toGroupColor } from "#lib/domain/group-color"
import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { setLocale } from "#lib/i18n/index"
import { memoryStorage } from "#lib/storage/contract"
import { MIGRATION_KEY } from "#lib/storage/migrate-locations"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"

/**
 * The Cards page's island (prototype `vCards`): the view in the address, the cards and the
 * limit groups, and a group's sheet on its own address (DD-102). Ported from the legacy route's
 * tests; where those read a child element's properties, these read what the child draws.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

/** Flushes the page's awaited reads and writes and Svelte's updates. */
const settle = async (rounds = 20) => {
	for (let i = 0; i < rounds; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

/** Lets a sheet's exit play out; `afterExit` waits on the animation or a timer. */
const exit = async () => {
	await new Promise((resolve) => setTimeout(resolve, 450))
	await settle()
}

const CLOCK = () => new Date("2026-10-31T03:00:00Z")

/** An address bar that records what the page did to it, and can play Back and Forward. */
const fakeBar = (start: string) => {
	const entries = [start]
	let at = 0
	const calls: string[] = []
	// Every listener hears each pop, as `popstate` reaches each: the page's and its panel's.
	const listeners = new Set<() => void>()
	const pop = () => {
		for (const listener of [...listeners]) listener()
	}
	const bar: AddressBar = {
		search: () => {
			const entry = entries[at] ?? ""
			const q = entry.indexOf("?")
			return q === -1 ? "" : entry.slice(q)
		},
		push: (url) => {
			calls.push(`push ${url}`)
			entries.splice(at + 1, entries.length, url)
			at++
		},
		replace: (url) => {
			calls.push(`replace ${url}`)
			entries[at] = url
		},
		onPop: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		length: () => entries.length,
		back: () => {
			calls.push("back")
			at = Math.max(0, at - 1)
			pop()
		},
	}
	const forward = () => {
		at = Math.min(entries.length - 1, at + 1)
		pop()
	}
	return { bar, calls, forward, now: () => entries[at] }
}

const card = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: `${id} card`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
})

const G1: LimitGroup = { id: "g1", name: "KBank", limit: 100_000_00, owner: "KC" }
const G2: LimitGroup = { id: "g2", name: "SCB", limit: 50_000_00, owner: "NT" }

/** Stores the three default location records, with only the `ticked` ones taking purchases. */
const saveLocations = async (repo: Repository, ticked: string[]) => {
	for (const record of defaultLocations(DEFAULT_SETTINGS))
		await repo.saveLocation({ ...record, takesPurchases: ticked.includes(record.id) })
}

const seed = async (repo: Repository) => {
	await repo.saveLimitGroup(G1)
	await repo.saveLimitGroup(G2)
	await repo.saveCard(card("A"))
	await repo.saveCard(card("B", { location: "bangkok", limitGroupId: "g2" }))
	await repo.saveCard(card("Z", { archived: true }))
	await saveLocations(repo, ["krabi"])
}

const setup = async (
	start = "/cards",
	options: {
		repo?: Repository
		before?: (repo: Repository) => Promise<void>
		storage?: Storage
		skipSeed?: boolean
	} = {},
) => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	const repo = options.repo ?? new InMemoryRepository()
	if (!options.skipSeed) await seed(repo)
	await options.before?.(repo)
	const address = fakeBar(start)
	mounted = mount(CardsPage, {
		target: document.body,
		props: {
			open: async () => ({ ok: true as const, repo }),
			clock: CLOCK,
			address: address.bar,
			storage: options.storage ?? memoryStorage(),
		},
	})
	await settle()
	return { repo, root: document.body, address }
}

const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)

const press = async (selector: string) => {
	const target = $(selector)
	if (!target) throw new Error(`no ${selector}`)
	target.click()
	await settle()
}

/** The section order of the cards list, by place id. */
const places = () =>
	[...document.querySelectorAll(".cards-body section[data-location]")].map((s) => s.getAttribute("data-location"))

/** Every card tile the list draws, archived ones included. */
const tiles = () => [...document.querySelectorAll(".cards-body a[data-card]")].map((a) => a.getAttribute("data-card"))

const shownTiles = () =>
	[...document.querySelectorAll(".cards-body a[data-card]")]
		.filter((a) => !a.closest("details.archive"))
		.map((a) => a.getAttribute("data-card"))

test("close sort follows upcoming tile dates rather than day numbers", async () => {
	await setup("/cards?sort=close", {
		skipSeed: true,
		before: async (repo) => {
			await repo.saveLimitGroup(G1)
			await repo.saveCard(card("early", { cycle: { kind: "offset", closeDay: 5, dueOffsetDays: 20 } }))
			await repo.saveCard(card("today", { cycle: { kind: "offset", closeDay: 31, dueOffsetDays: 20 } }))
		},
	})
	expect(shownTiles()).toEqual(["today", "early"])
	expect(flat($('[data-action="sort"]'))).toContain("Soonest to close")
})

test("due sort can be applied from the filter and restored from the address", async () => {
	const { address } = await setup("/cards?sort=close", {
		skipSeed: true,
		before: async (repo) => {
			await repo.saveLimitGroup(G1)
			await repo.saveCard(card("a", { cycle: { kind: "offset", closeDay: 5, dueOffsetDays: 30 } }))
			await repo.saveCard(card("b", { cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 1 } }))
		},
	})
	expect(shownTiles()).toEqual(["a", "b"])
	await press('[data-action="sort"]')
	await press('dialog [data-sort="due"]')
	await press('[data-action="apply"]')
	await exit()
	expect(address.now()).toBe("/cards?sort=due")
	expect(shownTiles()).toEqual(["b", "a"])
	expect(flat($('[data-action="sort"]'))).toContain("Soonest due")
	await setup("/cards?sort=due")
	expect(flat($('[data-action="sort"]'))).toContain("Soonest due")
})

const groupSheet = () => $("dialog input[name=limit]")?.closest("dialog") ?? null

const sheetHeading = () => flat(groupSheet()?.querySelector("h2"))

const filterSheet = () => $("dialog [data-action=apply]")?.closest("dialog") ?? null

const banner = () => flat($(".cards-main > .error-banner p"))

const openGroup = (id: string) => press(`.cards-groups .gpanel[data-group="${id}"]`)

const type = async (name: string, value: string) => {
	const input = $<HTMLInputElement>(`dialog input[name=${name}]`)
	if (!input) throw new Error(`no ${name}`)
	input.value = value
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

const submit = async () => {
	$("dialog form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
}

/** Fills and saves the open group sheet. */
const saveSheet = async (fields: { name?: string; limit?: string; owner?: string }) => {
	if (fields.name !== undefined) await type("name", fields.name)
	if (fields.limit !== undefined) await type("limit", fields.limit)
	if (fields.owner) await press(`dialog [data-owner="${fields.owner}"]`)
	await submit()
}

const closeSheet = async () => {
	await press("dialog [data-action=close]")
	await exit()
}

test("the heading names the page and links Add card to the new card form", async () => {
	await setup()
	expect(flat($("h1"))).toBe("Cards")
	const add = $<HTMLAnchorElement>('a[data-action="add-card"]')
	expect(add?.getAttribute("href")).toBe("/card/new")
	expect(flat(add)).toBe("Add card")
})

describe("the card panel (RD-23, RD-24)", () => {
	const panel = () => $("aside.detail-panel")
	const panelTitle = () => flat($(".detail-panel__head h2"))
	const tile = (id: string) => `.cards-body a.tile[data-card="${id}"]`
	// Card ids in their format (RD-28), which the address reads.
	const withPanelCards = {
		before: async (repo: Repository) => {
			await repo.saveCard(card("12.3"))
			await repo.saveCard(card("7", { location: "bangkok", limitGroupId: "g2" }))
		},
	}

	test("a tile opens its card's panel beside the list, pushing the address", async () => {
		const { address } = await setup("/cards?q=card", withPanelCards)
		expect(panel()).toBeNull()
		expect($(".panel-layout")?.hasAttribute("data-panel")).toBe(false)
		await press(tile("12.3"))
		expect(address.calls).toEqual(["push /cards?q=card&card=12.3"])
		expect(panelTitle()).toBe("12.3 card · KC (1234)")
		expect($(".panel-layout")?.hasAttribute("data-panel")).toBe(true)
		expect($(tile("12.3"))?.getAttribute("aria-current")).toBe("true")
	})

	test("another tile swaps the panel in place, and Back closes it", async () => {
		const { address } = await setup("/cards", withPanelCards)
		await press(tile("12.3"))
		await press(tile("7"))
		expect(address.calls).toEqual(["push /cards?card=12.3", "replace /cards?card=7"])
		expect(panelTitle()).toBe("7 card · NT (1234)")
		address.bar.back()
		await settle()
		expect(panel()).toBeNull()
		expect(address.now()).toBe("/cards")
	})

	test("× closes it by stepping back over its entry", async () => {
		const { address } = await setup("/cards", withPanelCards)
		await press(tile("12.3"))
		await press('[data-action="close-panel"]')
		expect(address.calls.at(-1)).toBe("back")
		expect(panel()).toBeNull()
	})

	test("a pasted address opens the panel at once; an unknown card opens nothing", async () => {
		await setup("/cards?card=7", withPanelCards)
		expect(panelTitle()).toBe("7 card · NT (1234)")
		const { address } = await setup("/cards?sort=room&card=99", withPanelCards)
		expect(panel()).toBeNull()
		expect(address.now()).toBe("/cards?sort=room")
	})

	test("a search typed with the panel open keeps the card in the address", async () => {
		const { address } = await setup("/cards?card=12.3", withPanelCards)
		const search = $<HTMLInputElement>('.cards-body input[type="search"]')
		if (!search) throw new Error("no search")
		search.value = "B"
		search.dispatchEvent(new Event("input", { bubbles: true }))
		await settle()
		expect(address.now()).toBe("/cards?q=B&card=12.3")
		expect(panel()).not.toBeNull()
	})

	test("Add card opens a blank card form in the panel, the address unchanged", async () => {
		const { address } = await setup("/cards?q=card", withPanelCards)
		await press('a[data-action="add-card"]')
		expect(address.calls).toEqual(["push /cards?q=card"])
		expect(panelTitle()).toBe("New card")
		expect($(".detail-panel form.card-form")).not.toBeNull()
	})

	test("a write in the panel reads the list again", async () => {
		const { repo } = await setup("/cards?card=12.3", withPanelCards)
		await press(".detail-panel__head button.more")
		await press('.detail-panel__head [data-action="archive"]')
		expect((await repo.getCard("12.3"))?.archived).toBe(true)
		expect($('details.archive a[data-card="12.3"]')).not.toBeNull()
	})
})

test("the header: title and switch on one row, the add button for the view under them", async () => {
	const { address } = await setup()
	const head = $(".cards-main > .cards-head")
	expect(head?.querySelector(":scope > h1")).not.toBeNull()
	expect(head?.querySelector(":scope > .cards-switch")).not.toBeNull()
	const adds = head?.querySelector(":scope > .cards-adds")
	expect(adds?.querySelector('a[data-action="add-card"]')).not.toBeNull()
	expect(adds?.querySelector('[data-action="add-group"]')).toBeNull()
	await press('.cards-switch [data-view="groups"]')
	const group = $<HTMLButtonElement>('.cards-head .cards-adds button[data-action="add-group"]')
	expect(flat(group)).toBe("Add group")
	expect(group?.getAttribute("data-variant")).toBe("quiet")
	await press('.cards-head .cards-adds button[data-action="add-group"]')
	expect(address.calls.at(-1)).toBe("push /cards?view=groups&newGroup=1")
	expect(sheetHeading()).toBe("Add limit group")
})

test("by place, sections run A to Z by shown name; a place with no record comes last", async () => {
	await setup("/cards", {
		before: async (repo) => {
			await repo.saveLocation({ id: "chiang-mai", name: "Chiang Mai", takesPurchases: false })
			await repo.saveCard(card("P", { location: "phichit" }))
			await repo.saveCard(card("C", { location: "chiang-mai" }))
			await repo.saveCard(card("G", { location: "gone" }))
		},
	})
	expect(places()).toEqual(["bangkok", "chiang-mai", "krabi", "phichit", "gone"])
	expect(shownTiles()).toHaveLength(5)
	expect(
		[...document.querySelectorAll("details.archive a[data-card]")].map((a) => a.getAttribute("data-card")),
	).toEqual(["Z"])
	const head = (id: string) => flat($(`section[data-location="${id}"] .place b`))
	expect(head("chiang-mai")).toBe("Chiang Mai")
	expect(head("gone")).toBe("gone")
})

test("the place order follows the language", async () => {
	await setup("/cards", {
		before: async (repo) => {
			// "Zebra" sorts last in English; renamed Krabi "Aardvark" sorts first.
			await repo.saveLocation({ id: "krabi", name: "Aardvark", takesPurchases: true })
			await repo.saveLocation({ id: "zebra", name: "Zebra", takesPurchases: false })
			await repo.saveCard(card("Q", { location: "zebra" }))
		},
	})
	expect(places()).toEqual(["krabi", "bangkok", "zebra"])
	setLocale("th")
	await settle()
	// In Thai, Bangkok reads กรุงเทพฯ, which Thai order puts before the Latin names.
	expect(places()).toEqual(["bangkok", "krabi", "zebra"])
})

test("every group gets a room, computed from its cards' ledgers", async () => {
	await setup("/cards", {
		before: async (repo) => {
			await repo.savePurchase({ id: "p1", cardId: "A", date: "2026-10-10", amount: 10_000_00, note: "fuel" })
		},
	})
	const panel = (id: string) => flat($(`.cards-groups .gpanel[data-group="${id}"]`))
	expect(panel("g1")).toContain("90,000")
	expect(panel("g1")).toContain("10%")
	expect(panel("g2")).toContain("50,000")
	expect(panel("g2")).toContain("0%")
	expect([...document.querySelectorAll(".cards-groups .gpanel")].map((p) => p.getAttribute("data-group"))).toEqual([
		"g1",
		"g2",
	])
})

test("a card holding credit shows it on its tile", async () => {
	await setup("/cards", {
		before: async (repo) => {
			await repo.saveCardPayment({ id: "pay1", cardId: "B", date: "2026-10-01", amount: 500_00, status: "paid" })
		},
	})
	expect(flat($('a[data-card="B"]'))).toContain("500")
	expect(flat($('a[data-card="A"]'))).not.toContain("500")
})

test("a phone switch picks Cards or Limit groups, kept in the address", async () => {
	const { address } = await setup("/cards?sort=name")
	const grid = $(".cards-grid")
	const button = (name: string) => $(`.cards-switch [data-view="${name}"]`)
	expect(flat(button("cards"))).toBe("Cards")
	expect(flat(button("groups"))).toBe("Limit groups")
	expect(button("cards")?.getAttribute("aria-pressed")).toBe("true")
	expect(button("groups")?.getAttribute("aria-pressed")).toBe("false")
	expect(grid?.getAttribute("data-show")).toBe("cards")
	await press('.cards-switch [data-view="groups"]')
	expect(address.calls.at(-1)).toBe("replace /cards?view=groups&sort=name")
	expect(grid?.getAttribute("data-show")).toBe("groups")
	expect(button("groups")?.getAttribute("aria-pressed")).toBe("true")
	await press('.cards-switch [data-view="cards"]')
	expect(address.calls.at(-1)).toBe("replace /cards?sort=name")
})

test("a reload on ?view=groups keeps the groups shown, and opening a group keeps it", async () => {
	const { address } = await setup("/cards?view=groups")
	expect($(".cards-grid")?.getAttribute("data-show")).toBe("groups")
	expect($('.cards-switch [data-view="groups"]')?.getAttribute("aria-pressed")).toBe("true")
	await openGroup("g1")
	expect(address.calls.at(-1)).toBe("push /cards?view=groups&group=g1")
})

test("the address seeds the view; typing a search replaces it", async () => {
	const { address } = await setup("/cards?sort=name&owner=NT")
	expect(shownTiles()).toEqual(["B"])
	const input = $<HTMLInputElement>('input[name="q"]')
	if (!input) throw new Error("no search")
	input.value = "zzz"
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
	expect(address.calls.at(-1)).toBe("replace /cards?q=zzz&owner=NT&sort=name")
	expect(shownTiles()).toEqual([])
	expect(flat($(".cards-body .empty"))).not.toBe("")
})

test("the filter sheet applies a whole view, shown as chips that clear one at a time", async () => {
	const { address } = await setup()
	expect(filterSheet()).toBeNull()
	await press('[data-action="filter"]')
	expect(filterSheet()).not.toBeNull()
	await press('dialog [data-location="bangkok"]')
	expect(flat($("dialog [data-action=apply]"))).toContain("1")
	await press('dialog [data-location="bangkok"]')
	await press('dialog [data-location="krabi"]')
	await press('dialog [data-sort="room"]')
	await press("dialog [data-action=apply]")
	await exit()
	expect(filterSheet()).toBeNull()
	expect(address.now()).toBe("/cards?loc=krabi&sort=room")
	expect(shownTiles()).toEqual(["A"])
	expect(flat($(".tx-count"))).toBe("1")
	expect(flat($('[data-chip="loc:krabi"]'))).toBe("Krabi ×")
	expect(flat($('[data-action="sort"]'))).toContain("Most room")
	await press('[data-chip="loc:krabi"]')
	expect(address.now()).toBe("/cards?sort=room")
})

test("Group by is applied from the sheet, kept in the address, and named on its chip", async () => {
	const { address } = await setup()
	expect(flat($('[data-action="group"]'))).toBe("Group: Place ▾")
	await press('[data-action="group"]')
	await press('dialog [data-by="none"]')
	await press("dialog [data-action=apply]")
	await exit()
	expect(address.now()).toBe("/cards?by=none")
	expect($("section[data-location]")).toBeNull()
	expect(flat($('[data-action="group"]'))).toBe("Group: None ▾")
})

test("a sort runs either way, kept in the address as dir", async () => {
	const { address } = await setup("/cards?sort=name")
	await press('[data-action="sort"]')
	await press('dialog [data-dir="desc"]')
	await press("dialog [data-action=apply]")
	await exit()
	expect(address.now()).toBe("/cards?sort=name&dir=desc")
	expect(flat($('[data-action="sort"]'))).toContain("Z to A")
	await setup("/cards?sort=name&dir=desc")
	expect(flat($('[data-action="sort"]'))).toContain("Z to A")
})

test("the filter offers every stored place A to Z, and a custom choice survives a reload", async () => {
	const before = async (repo: Repository) => {
		await repo.saveLocation({ id: "chiang-mai", name: "Chiang Mai", takesPurchases: false })
		await repo.saveCard(card("C", { location: "chiang-mai" }))
	}
	const { address } = await setup("/cards", { before })
	await press('[data-action="filter"]')
	expect([...document.querySelectorAll("dialog [data-location]")].map((b) => b.getAttribute("data-location"))).toEqual([
		"bangkok",
		"chiang-mai",
		"krabi",
		"phichit",
	])
	await press('dialog [data-location="chiang-mai"]')
	await press('dialog [data-location="bangkok"]')
	await press("dialog [data-action=apply]")
	await exit()
	const url = address.now() ?? ""
	expect(url).toBe("/cards?loc=chiang-mai&loc=bangkok")

	await setup(url, { before })
	expect(places()).toEqual(["bangkok", "chiang-mai"])
	expect(flat($('[data-chip="loc:chiang-mai"]'))).toBe("Chiang Mai ×")
	await press('[data-action="filter"]')
	expect(
		[...document.querySelectorAll('dialog [data-location][aria-pressed="true"]')].map((b) =>
			b.getAttribute("data-location"),
		),
	).toEqual(["bangkok", "chiang-mai"])
})

test("a place in the address with no record is dropped", async () => {
	await setup("/cards?loc=mars&loc=krabi")
	expect(places()).toEqual(["krabi"])
	expect($('[data-chip="loc:mars"]')).toBeNull()
})

test("closing the filter sheet keeps the view", async () => {
	const { address } = await setup()
	await press('[data-action="filter"]')
	await press("dialog [data-action=close]")
	await exit()
	expect(filterSheet()).toBeNull()
	expect(address.calls).toEqual([])
})

test("no cards at all tells the list so", async () => {
	await setup("/cards", { skipSeed: true })
	expect(tiles()).toEqual([])
	expect(flat($(".cards-body .empty"))).toBe("No cards yet. Add one with Add card.")
	expect($(".cards-groups .gpanel")).toBeNull()
	expect($(".cards-groups .empty")).not.toBeNull()
})

test("tapping a group pushes its address and opens the sheet; Close steps back", async () => {
	const { address } = await setup("/cards?sort=name")
	expect(groupSheet()).toBeNull()
	await openGroup("g1")
	expect(address.calls).toEqual(["push /cards?sort=name&group=g1"])
	expect(sheetHeading()).toBe("Edit KBank")
	// A card uses it, so it can't be deleted.
	expect($("dialog [data-action=delete-group]")).toBeNull()
	await closeSheet()
	expect(address.calls.at(-1)).toBe("back")
	expect(address.now()).toBe("/cards?sort=name")
	expect(groupSheet()).toBeNull()
})

test("Back closes a pushed sheet, and Forward reopens it", async () => {
	const { address } = await setup()
	await openGroup("g2")
	address.bar.back()
	await settle()
	expect(groupSheet()).toBeNull()
	address.forward()
	await settle()
	expect(sheetHeading()).toBe("Edit SCB")
	await closeSheet()
	expect(address.calls.at(-1)).toBe("back")
})

test("a sheet opened from the address closes by replacing it without the group", async () => {
	const { address } = await setup("/cards?q=A&group=g2")
	expect(sheetHeading()).toBe("Edit SCB")
	await closeSheet()
	expect(address.calls).toEqual(["replace /cards?q=A"])
	expect(groupSheet()).toBeNull()
})

test("an unknown group in the address opens no sheet", async () => {
	await setup("/cards?group=nope")
	expect(groupSheet()).toBeNull()
})

test("a group no card uses can be deleted; the sheet closes once it is gone", async () => {
	const { repo, address } = await setup("/cards?group=g3", {
		before: async (r) => {
			await r.saveLimitGroup({ id: "g3", name: "Spare", limit: 1_000_00, owner: "RI" })
		},
	})
	await press("dialog [data-action=delete-group]")
	await press("dialog [data-action=confirm-delete]")
	expect((await repo.listLimitGroups()).map((g) => g.id)).toEqual(["g1", "g2"])
	expect(groupSheet()).toBeNull()
	expect(address.calls).toEqual(["replace /cards"])
})

test("Add group pushes ?newGroup=1 and saves the new group with a valid colour, then closes", async () => {
	const { repo, address } = await setup()
	await press('.cards-groups [data-action="add-group"]')
	expect(address.calls).toEqual(["push /cards?newGroup=1"])
	expect(sheetHeading()).toBe("Add limit group")
	await saveSheet({ name: "New", limit: "20000", owner: "RI" })
	const saved = (await repo.listLimitGroups()).find((g) => g.name === "New")
	expect(saved?.limit).toBe(20_000_00)
	expect(toGroupColor(saved?.color)).not.toBeNull()
	expect(address.calls.at(-1)).toBe("back")
	expect(groupSheet()).toBeNull()
	expect(document.querySelectorAll(".cards-groups .gpanel")).toHaveLength(3)
})

class FlakyGroupRepository extends InMemoryRepository {
	failures = 0
	tried: string[] = []
	override async saveLimitGroup(group: LimitGroup): Promise<void> {
		this.tried.push(group.id)
		if (this.failures > 0) {
			this.failures--
			throw new Error("disk is full")
		}
		return super.saveLimitGroup(group)
	}
}

test("a failed save keeps the sheet open with the reason, and a retry keeps the new group's id", async () => {
	const repo = new FlakyGroupRepository()
	await seed(repo)
	repo.failures = 1
	repo.tried = []
	const { address } = await setup("/cards?newGroup=1", { repo, skipSeed: true })
	await saveSheet({ name: "New", limit: "20000", owner: "RI" })
	expect(groupSheet()).not.toBeNull()
	expect(sheetHeading()).toBe("Add limit group")
	expect(flat($("dialog .error-banner"))).toContain("Could not save that limit group.")
	expect($<HTMLButtonElement>("dialog button[type=submit]")?.disabled).toBe(false)
	expect(address.calls).toEqual([])
	// The page's banner leaves the reason to the sheet it failed in.
	expect(banner()).toBe("")
	await submit()
	expect(repo.tried).toHaveLength(2)
	expect(repo.tried[0]).toBe(repo.tried[1])
	expect(groupSheet()).toBeNull()
	expect(address.calls).toEqual(["replace /cards"])
})

test("closing the sheet after a failed save leaves the banner empty", async () => {
	const repo = new FlakyGroupRepository()
	await seed(repo)
	repo.failures = 1
	await setup("/cards?newGroup=1", { repo, skipSeed: true })
	await saveSheet({ name: "New", limit: "20000", owner: "RI" })
	expect(flat($("dialog .error-banner"))).toContain("disk is full")
	await closeSheet()
	expect(groupSheet()).toBeNull()
	expect(banner()).toBe("")
})

class FailThenHoldRepository extends InMemoryRepository {
	armed = false
	calls = 0
	release = () => {}
	override async saveLimitGroup(group: LimitGroup): Promise<void> {
		if (!this.armed) return super.saveLimitGroup(group)
		this.calls++
		if (this.calls === 1) throw new Error("disk is full")
		await new Promise<void>((resolve) => {
			this.release = resolve
		})
		return super.saveLimitGroup(group)
	}
}

test("the page banner stays empty while a retry is under way", async () => {
	const repo = new FailThenHoldRepository()
	await seed(repo)
	repo.armed = true
	await setup("/cards?newGroup=1", { repo, skipSeed: true })
	await saveSheet({ name: "New", limit: "20000", owner: "RI" })
	await submit()
	expect($<HTMLButtonElement>("dialog button[type=submit]")?.disabled).toBe(true)
	expect(banner()).toBe("")
	repo.release()
	await settle()
})

class SlowGroupRepository extends InMemoryRepository {
	release = () => {}
	override async saveLimitGroup(group: LimitGroup): Promise<void> {
		if (group.id === "g2" && group.name === "SCB 2")
			await new Promise<void>((resolve) => {
				this.release = resolve
			})
		return super.saveLimitGroup(group)
	}
}

test("opening another group while a save is under way is ignored", async () => {
	const repo = new SlowGroupRepository()
	const { address } = await setup("/cards?group=g2", { repo })
	await saveSheet({ name: "SCB 2" })
	await openGroup("g1")
	expect(address.calls).toEqual([])
	repo.release()
	await settle()
	expect(groupSheet()).toBeNull()
	expect(address.now()).toBe("/cards")
})

test("an edited group saves under its own id", async () => {
	const { repo } = await setup("/cards?group=g2")
	await saveSheet({ name: "SCB 2" })
	expect((await repo.listLimitGroups()).find((g) => g.id === "g2")?.name).toBe("SCB 2")
	expect(groupSheet()).toBeNull()
})

test("the location reset notice shows once and can be dismissed", async () => {
	const storage = memoryStorage()
	storage.setItem(MIGRATION_KEY, JSON.stringify(["Old card"]))
	await setup("/cards", { storage })
	expect(flat($('[data-testid="location-reset"]'))).toContain("Old card")
	await press('[data-testid="location-reset"] button')
	expect($('[data-testid="location-reset"]')).toBeNull()
	expect(storage.getItem(MIGRATION_KEY)).toBeNull()
})

test("a language switch re-renders the page in place", async () => {
	await setup()
	setLocale("th")
	await settle()
	expect(flat($("h1"))).toBe("บัตร")
	expect(flat($('[data-action="add-card"]'))).toBe("เพิ่มบัตร")
})

class HeldGroupRepository extends InMemoryRepository {
	hold = false
	release: () => void = () => {}
	override saveLimitGroup(group: LimitGroup): Promise<void> {
		if (!this.hold) return super.saveLimitGroup(group)
		return new Promise((resolve) => {
			this.release = () => resolve(super.saveLimitGroup(group))
		})
	}
}

test("Back during a pending save: the save closes nothing further once it lands", async () => {
	const repo = new HeldGroupRepository()
	const { address } = await setup("/cards", { repo })
	repo.hold = true
	await openGroup("g2")
	await saveSheet({ name: "SCB 2" })
	expect($<HTMLButtonElement>("dialog button[type=submit]")?.disabled).toBe(true)
	address.bar.back() // the reader's Back while the write is pending
	await settle()
	repo.release()
	await settle()
	expect(address.calls.filter((c) => c === "back")).toHaveLength(1)
	expect(address.now()).toBe("/cards")
	expect(groupSheet()).toBeNull()
	expect((await repo.listLimitGroups()).find((g) => g.id === "g2")?.name).toBe("SCB 2")
})

test("?group=new opens the group whose id is new; ?newGroup=1 opens the blank sheet", async () => {
	await setup("/cards?group=new", {
		before: async (r) => {
			await r.saveLimitGroup({ id: "new", name: "Odd", limit: 1_00, owner: "RI" })
		},
	})
	expect(sheetHeading()).toBe("Edit Odd")
	await setup("/cards?newGroup=1")
	expect(sheetHeading()).toBe("Add limit group")
})

test("a card in no stored group is left out, and ?ungrouped=1 is not read (RD-27)", async () => {
	await setup("/cards")
	const shown = shownTiles().sort()
	await setup("/cards?ungrouped=1", {
		before: async (r) => {
			const { limitGroupId: _, ...loose } = card("N")
			await r.saveCard(loose)
			await r.saveCard(card("O", { limitGroupId: "gone" }))
		},
	})
	expect(shownTiles().sort()).toEqual(shown)
	expect(document.body.textContent).not.toContain("Not in a group")
	expect(document.body.textContent).not.toContain("No limit group")
})

test("a store that won't open shows why, with Reload, and no cards", async () => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(CardsPage, {
		target: document.body,
		props: {
			open: async () => ({ ok: false as const, message: () => "Storage is off." }),
			address: fakeBar("/cards").bar,
			storage: memoryStorage(),
		},
	})
	await settle()
	expect(banner()).toBe("Storage is off.")
	expect($(".cards-body")).toBeNull()
})
