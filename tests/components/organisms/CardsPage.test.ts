import type { Card, LimitGroup } from "#lib/domain/types"
import type { AddressBar } from "#lib/ui/address-bar"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, describe, expect, test } from "vitest"

import CardsPage from "#components/organisms/CardsPage.svelte"
import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { setLocale } from "#lib/i18n/index"
import { memoryStorage } from "#lib/storage/contract"
import { MIGRATION_KEY } from "#lib/storage/migrate-locations"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"

/**
 * The Cards tab's island (`/cards`, RD-22): the view in the address, the cards, and a card's
 * panel (RD-23). The limit groups are the Limits tab's (`LimitsPage`). Ported from the legacy
 * route's tests; where those read a child element's properties, these read what the child draws.
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

const filterSheet = () => $("dialog [data-action=apply]")?.closest("dialog") ?? null

const banner = () => flat($(".cards-main > .error-banner p"))

test("+ Add card sits at the end of the search row, a quiet button, and no title or switch of its own", async () => {
	await setup()
	const row = [...($(".tx-ctl")?.children ?? [])].map((el) => el.getAttribute("data-action") ?? el.tagName)
	expect(row).toEqual(["LABEL", "filter", "add-card"])
	const add = $<HTMLButtonElement>('button[data-action="add-card"]')
	expect(add?.getAttribute("data-variant")).toBe("quiet")
	expect(flat(add)).toBe("Add card")
	// The page's static head holds the title and the tabs (PageTabs); the island holds neither.
	expect($("h1")).toBeNull()
	expect($(".cards-switch")).toBeNull()
	expect($(".cards-groups")).toBeNull()
	expect($(".gpanel")).toBeNull()
})

test("the retired view and group keys open nothing", async () => {
	await setup("/cards?view=groups&group=g1&newGroup=1")
	expect($("dialog")).toBeNull()
	expect($(".detail-panel")).toBeNull()
	expect(shownTiles().sort()).toEqual(["A", "B"])
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
		await press('button[data-action="add-card"]')
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

test("a card holding credit shows it on its tile", async () => {
	await setup("/cards", {
		before: async (repo) => {
			await repo.saveCardPayment({ id: "pay1", cardId: "B", date: "2026-10-01", amount: 500_00, status: "paid" })
		},
	})
	expect(flat($('a[data-card="B"]'))).toContain("500")
	expect(flat($('a[data-card="A"]'))).not.toContain("500")
})

test("the address seeds the view; typing a search replaces it", async () => {
	const { address } = await setup("/cards?sort=name&f.owners=NT")
	expect(shownTiles()).toEqual(["B"])
	const input = $<HTMLInputElement>('input[name="q"]')
	if (!input) throw new Error("no search")
	input.value = "zzz"
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
	expect(address.calls.at(-1)).toBe("replace /cards?q=zzz&f.owners=NT&sort=name")
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
	expect(address.now()).toBe("/cards?f.locations=krabi&sort=room")
	expect(shownTiles()).toEqual(["A"])
	expect(flat($(".tx-count"))).toBe("1")
	expect(flat($('[data-chip="loc:krabi"]'))).toBe("Krabi ×")
	expect(flat($('[data-action="sort"]'))).toContain("Most room")
	await press('[data-chip="loc:krabi"]')
	expect(address.now()).toBe("/cards?sort=room")
})

test("Usage and the used sort are applied from the sheet, kept in the address, and the usage shown as a chip", async () => {
	const { address } = await setup("/cards?by=none", {
		before: async (repo) => {
			await repo.savePurchase({ id: "p1", cardId: "B", date: "2026-10-20", amount: 900_00, note: "" })
		},
	})
	expect(shownTiles()).toEqual(["A", "B"])
	await press('[data-action="filter"]')
	await press('dialog [data-usage="used"]')
	await press('dialog [data-sort="used"]')
	await press("dialog [data-action=apply]")
	await exit()
	expect(address.now()).toBe("/cards?f.usage=used&sort=used&by=none")
	expect(shownTiles()).toEqual(["B"])
	expect(flat($('[data-chip="usage:used"]'))).toBe("Used ×")
	expect(flat($('[data-action="sort"]'))).toContain("Most used")
	await press('[data-chip="usage:used"]')
	expect(address.now()).toBe("/cards?sort=used&by=none")
	expect(shownTiles()).toEqual(["B", "A"])
})

test("the glance panels sum the shown cards, follow the filter, and each section heads its own totals", async () => {
	const { address } = await setup("/cards", {
		before: async (repo) => {
			// A's September statement (closes 25 Sep, due 15 Oct) is past due on 31 Oct; B's is on the open one.
			await repo.savePurchase({ id: "p1", cardId: "A", date: "2026-09-20", amount: 1_000_00, note: "" })
			await repo.savePurchase({ id: "p2", cardId: "B", date: "2026-10-20", amount: 300_00, note: "" })
		},
	})
	const figure = (field: string) => flat($(`.cards-glance [data-field="${field}"] b`))
	expect(figure("count")).toBe("2")
	expect(figure("owed")).toBe("฿1,300.00")
	expect(flat($('section[data-location="krabi"] .section-glance'))).toBe(
		"฿1,000.00 owed · ฿0.00 due in 7 days · 1% used",
	)
	expect(flat($('section[data-location="bangkok"] .section-glance'))).toBe(
		"฿300.00 owed · ฿0.00 due in 7 days · 1% used",
	)
	await press('[data-action="filter"]')
	await press('dialog [data-state="overdue"]')
	await press("dialog [data-action=apply]")
	await exit()
	expect(address.now()).toBe("/cards?f.states=overdue")
	expect(shownTiles()).toEqual(["A"])
	expect(flat($('[data-chip="state:overdue"]'))).toBe("Overdue ×")
	expect(figure("count")).toBe("1")
	expect(figure("owed")).toBe("฿1,000.00")
})

test("no matching card shows no glance panels", async () => {
	await setup("/cards?q=zzz")
	expect($(".cards-glance")).toBeNull()
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
	expect(url).toBe("/cards?f.locations=chiang-mai&f.locations=bangkok")

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
	await setup("/cards?f.locations=mars&f.locations=krabi")
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
	expect(flat($('[data-action="add-card"]'))).toBe("เพิ่มบัตร")
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
