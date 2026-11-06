import type { CcCardsFilter } from "#components/cc-cards-filter"
import type { CcCardsList } from "#components/cc-cards-list"
import type { CcGroupPanels } from "#components/cc-group-panels"
import type { CcGroupSheet } from "#components/cc-group-sheet"
import type { Card, LimitGroup } from "#lib/domain/types"

import { expect, test } from "vitest"

import { DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view"
import { toGroupColor } from "#lib/domain/group-color"
import { setLocale } from "#lib/i18n/index"
import { memoryStorage } from "#lib/storage/contract"
import { MIGRATION_KEY } from "#lib/storage/migrate-locations"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { type CardsAddressBar, renderCardsPage } from "./cards"
import { CLOCK, flatText, mount, saveLocations, settle } from "./list/test-support"

/** An address bar that records what the page did to it, and can play Back and Forward. */
const fakeBar = (start: string) => {
	const entries = [start]
	let at = 0
	const calls: string[] = []
	let pop = () => {}
	const bar: CardsAddressBar = {
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
			pop = listener
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

const G1: LimitGroup = {
	id: "g1",
	name: "KBank",
	limit: 100_000_00,
	owner: "KC",
}
const G2: LimitGroup = { id: "g2", name: "SCB", limit: 50_000_00, owner: "NT" }

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
	setLocale("en")
	const repo = options.repo ?? new InMemoryRepository()
	if (!options.skipSeed) await seed(repo)
	await options.before?.(repo)
	const root = mount()
	const address = fakeBar(start)
	renderCardsPage(repo, root, {
		clock: CLOCK,
		address: address.bar,
		storage: options.storage ?? memoryStorage(),
	})
	await settle(5)
	return { repo, root, address }
}

const list = (root: HTMLElement) => root.querySelector<CcCardsList>("cc-cards-list")
const panels = (root: HTMLElement) => root.querySelector<CcGroupPanels>("cc-group-panels")
const sheet = () => document.querySelector<CcGroupSheet>("cc-group-sheet")
const filter = (root: HTMLElement) => root.querySelector<CcCardsFilter>("cc-cards-filter")

test("the heading names the page and links Add card to the new card form", async () => {
	const { root } = await setup()
	expect(flatText(root.querySelector("h1"))).toBe("Cards")
	const add = root.querySelector<HTMLAnchorElement>('a[data-action="add-card"]')
	expect(add?.getAttribute("href")).toBe("/card/new")
	expect(flatText(add)).toBe("Add card")
})

test("the header: title and switch on one row, the add button for the view under them", async () => {
	const { root, address } = await setup()
	const head = root.querySelector(".cards-main > .cards-head")
	expect(head?.querySelector(":scope > h1")).not.toBeNull()
	expect(head?.querySelector(":scope > .cards-switch")).not.toBeNull()
	const adds = head?.querySelector(":scope > .cards-adds")
	expect(adds?.querySelector('a[data-action="add-card"]')).not.toBeNull()
	expect(adds?.querySelector('[data-action="add-group"]')).toBeNull()
	root.querySelector<HTMLButtonElement>('.cards-switch [data-view="groups"]')?.click()
	await settle()
	const group = root.querySelector<HTMLButtonElement>('.cards-head .cards-adds button[data-action="add-group"]')
	expect(flatText(group)).toBe("Add group")
	expect(group?.getAttribute("data-variant")).toBe("quiet")
	group?.click()
	await settle()
	expect(address.calls.at(-1)).toBe("push /cards?view=groups&newGroup=1")
	expect(sheet()?.group).toBeNull()
})

test("by place, sections run A to Z by shown name; a place with no record comes last", async () => {
	const { root } = await setup("/cards", {
		before: async (repo) => {
			await repo.saveLocation({
				id: "chiang-mai",
				name: "Chiang Mai",
				takesPurchases: false,
			})
			await repo.saveCard(card("P", { location: "phichit" }))
			await repo.saveCard(card("C", { location: "chiang-mai" }))
			await repo.saveCard(card("G", { location: "gone" }))
		},
	})
	const el = list(root)
	expect(el?.results.sections?.map((s) => s.location)).toEqual(["bangkok", "chiang-mai", "krabi", "phichit", "gone"])
	expect(el?.results.count).toBe(5)
	expect(el?.results.archived.map((c) => c.id)).toEqual(["Z"])
	expect(el?.total).toBe(6)
	const head = (id: string) => flatText(el?.shadowRoot?.querySelector(`section[data-location="${id}"] .place b`))
	expect(head("chiang-mai")).toBe("Chiang Mai")
	expect(head("gone")).toBe("gone")
})

test("the place order follows the language on every paint", async () => {
	const { root } = await setup("/cards", {
		before: async (repo) => {
			// "Zebra" sorts last in English; renamed Krabi "Aardvark" sorts first.
			await repo.saveLocation({
				id: "krabi",
				name: "Aardvark",
				takesPurchases: true,
			})
			await repo.saveLocation({
				id: "zebra",
				name: "Zebra",
				takesPurchases: false,
			})
			await repo.saveCard(card("Q", { location: "zebra" }))
		},
	})
	expect(list(root)?.results.sections?.map((s) => s.location)).toEqual(["krabi", "bangkok", "zebra"])
	setLocale("th")
	await settle()
	// In Thai, Bangkok reads กรุงเทพฯ, which Thai order puts before the Latin names.
	expect(list(root)?.results.sections?.map((s) => s.location)).toEqual(["bangkok", "krabi", "zebra"])
	setLocale("en")
})

test("every group gets a room, computed from its cards' ledgers", async () => {
	const { root } = await setup("/cards", {
		before: async (repo) => {
			await repo.savePurchase({
				id: "p1",
				cardId: "A",
				date: "2026-10-10",
				amount: 10_000_00,
				note: "fuel",
			})
		},
	})
	const el = list(root)
	expect(el?.rooms.get("g1")?.room).toBe(90_000_00)
	expect(el?.rooms.get("g2")?.room).toBe(50_000_00)
	const shown = panels(root)?.panels ?? []
	expect(shown.map((p) => [p.group.id, p.room, p.usedPct])).toEqual([
		["g1", 90_000_00, 10],
		["g2", 50_000_00, 0],
	])
})

test("a card holding credit passes it to its row", async () => {
	const { root } = await setup("/cards", {
		before: async (repo) => {
			await repo.saveCardPayment({
				id: "pay1",
				cardId: "B",
				date: "2026-10-01",
				amount: 500_00,
				status: "paid",
			})
		},
	})
	expect(list(root)?.credits.get("B")).toBe(500_00)
})

test("a phone switch picks Cards or Limit groups, kept in the address", async () => {
	const { root, address } = await setup("/cards?sort=name")
	const grid = root.querySelector(".cards-grid")
	const button = (name: string) => root.querySelector<HTMLButtonElement>(`.cards-switch [data-view="${name}"]`)
	expect(flatText(button("cards"))).toBe("Cards")
	expect(flatText(button("groups"))).toBe("Limit groups")
	expect(button("cards")?.getAttribute("aria-pressed")).toBe("true")
	expect(button("groups")?.getAttribute("aria-pressed")).toBe("false")
	expect(grid?.getAttribute("data-show")).toBe("cards")
	button("groups")?.click()
	await settle()
	expect(address.calls.at(-1)).toBe("replace /cards?view=groups&sort=name")
	expect(grid?.getAttribute("data-show")).toBe("groups")
	expect(button("groups")?.getAttribute("aria-pressed")).toBe("true")
	button("cards")?.click()
	await settle()
	expect(address.calls.at(-1)).toBe("replace /cards?sort=name")
})

test("a reload on ?view=groups keeps the groups shown, and opening a group keeps it", async () => {
	const { root, address } = await setup("/cards?view=groups")
	expect(root.querySelector(".cards-grid")?.getAttribute("data-show")).toBe("groups")
	expect(root.querySelector('.cards-switch [data-view="groups"]')?.getAttribute("aria-pressed")).toBe("true")
	panels(root)?.dispatchEvent(new CustomEvent("open-group", { detail: { id: "g1" } }))
	await settle()
	expect(address.calls.at(-1)).toBe("push /cards?view=groups&group=g1")
})

test("the address seeds the view; typing a search replaces it", async () => {
	const { root, address } = await setup("/cards?sort=name&owner=NT")
	const el = list(root)
	expect(el?.results.flat?.map((c) => c.id)).toEqual(["B"])
	const input = root.querySelector<HTMLInputElement>('input[name="q"]')
	if (!input) throw new Error("no search")
	input.value = "zzz"
	input.dispatchEvent(new Event("input"))
	await settle()
	expect(address.calls.at(-1)).toBe("replace /cards?q=zzz&owner=NT&sort=name")
	expect(list(root)?.results.count).toBe(0)
	expect(list(root)?.total).toBe(3)
})

test("the filter sheet applies a whole view, shown as chips that clear one at a time", async () => {
	const { root, address } = await setup()
	expect(filter(root)).toBeNull()
	root.querySelector<HTMLButtonElement>('[data-action="filter"]')?.click()
	await settle()
	const sheetEl = filter(root)
	expect(sheetEl).not.toBeNull()
	expect(sheetEl?.count({ ...DEFAULT_CARDS_VIEW, locations: ["bangkok"] })).toBe(1)
	sheetEl?.dispatchEvent(
		new CustomEvent("apply", {
			detail: { ...DEFAULT_CARDS_VIEW, locations: ["krabi"], sort: "room" },
		}),
	)
	await settle()
	expect(filter(root)).toBeNull()
	expect(address.now()).toBe("/cards?loc=krabi&sort=room")
	expect(list(root)?.results.flat?.map((c) => c.id)).toEqual(["A"])
	expect(flatText(root.querySelector(".tx-count"))).toBe("1")
	const chip = root.querySelector<HTMLButtonElement>('[data-chip="loc:krabi"]')
	expect(flatText(chip)).toBe("Krabi ×")
	expect(flatText(root.querySelector('[data-action="sort"]'))).toContain("Most room")
	chip?.click()
	await settle()
	expect(address.now()).toBe("/cards?sort=room")
})

test("the filter offers every stored place A to Z, and a custom choice survives a reload", async () => {
	const { root, address } = await setup("/cards", {
		before: async (repo) => {
			await repo.saveLocation({
				id: "chiang-mai",
				name: "Chiang Mai",
				takesPurchases: false,
			})
			await repo.saveCard(card("C", { location: "chiang-mai" }))
		},
	})
	root.querySelector<HTMLButtonElement>('[data-action="filter"]')?.click()
	await settle()
	expect(filter(root)?.locations.map((r) => r.id)).toEqual(["bangkok", "chiang-mai", "krabi", "phichit"])
	filter(root)?.dispatchEvent(
		new CustomEvent("apply", {
			detail: { ...DEFAULT_CARDS_VIEW, locations: ["chiang-mai", "bangkok"] },
		}),
	)
	await settle()
	const url = address.now() ?? ""
	expect(url).toBe("/cards?loc=chiang-mai&loc=bangkok")
	const again = await setup(url, {
		before: async (repo) => {
			await repo.saveLocation({
				id: "chiang-mai",
				name: "Chiang Mai",
				takesPurchases: false,
			})
			await repo.saveCard(card("C", { location: "chiang-mai" }))
		},
	})
	expect(list(again.root)?.results.sections?.map((s) => s.location)).toEqual(["bangkok", "chiang-mai"])
	expect(flatText(again.root.querySelector('[data-chip="loc:chiang-mai"]'))).toBe("Chiang Mai ×")
	again.root.querySelector<HTMLButtonElement>('[data-action="filter"]')?.click()
	await settle()
	expect(filter(again.root)?.view.locations).toEqual(["chiang-mai", "bangkok"])
})

test("a place in the address with no record is dropped", async () => {
	const { root } = await setup("/cards?loc=mars&loc=krabi")
	expect(list(root)?.results.sections?.map((s) => s.location)).toEqual(["krabi"])
	expect(root.querySelector('[data-chip="loc:mars"]')).toBeNull()
})

test("closing the filter sheet keeps the view", async () => {
	const { root, address } = await setup()
	root.querySelector<HTMLButtonElement>('[data-action="filter"]')?.click()
	await settle()
	filter(root)?.dispatchEvent(new CustomEvent("close"))
	await settle()
	expect(filter(root)).toBeNull()
	expect(address.calls).toEqual([])
})

test("no cards at all tells the list so", async () => {
	const { root } = await setup("/cards", { skipSeed: true })
	expect(list(root)?.total).toBe(0)
	expect(panels(root)?.panels).toEqual([])
})

test("tapping a group pushes its address and opens the sheet; Close steps back", async () => {
	const { root, address } = await setup("/cards?sort=name")
	expect(sheet()).toBeNull()
	panels(root)?.dispatchEvent(new CustomEvent("open-group", { detail: { id: "g1" } }))
	await settle()
	expect(address.calls).toEqual(["push /cards?sort=name&group=g1"])
	expect(sheet()?.group).toEqual(G1)
	expect(sheet()?.inUse).toBe(true)
	sheet()?.dispatchEvent(new CustomEvent("close"))
	await settle()
	expect(address.calls.at(-1)).toBe("back")
	expect(address.now()).toBe("/cards?sort=name")
	expect(sheet()).toBeNull()
})

test("Back closes a pushed sheet, and Forward reopens it", async () => {
	const { root, address } = await setup()
	panels(root)?.dispatchEvent(new CustomEvent("open-group", { detail: { id: "g2" } }))
	await settle()
	address.bar.back()
	await settle()
	expect(sheet()).toBeNull()
	address.forward()
	await settle()
	expect(sheet()?.group?.id).toBe("g2")
	sheet()?.dispatchEvent(new CustomEvent("close"))
	await settle()
	expect(address.calls.at(-1)).toBe("back")
})

test("a sheet opened from the address closes by replacing it without the group", async () => {
	const { address } = await setup("/cards?q=A&group=g2")
	expect(sheet()?.group?.id).toBe("g2")
	sheet()?.dispatchEvent(new CustomEvent("close"))
	await settle()
	expect(address.calls).toEqual(["replace /cards?q=A"])
	expect(sheet()).toBeNull()
})

test("an unknown group in the address opens no sheet", async () => {
	await setup("/cards?group=nope")
	expect(sheet()).toBeNull()
})

test("a group no card uses can be deleted; the sheet closes once it is gone", async () => {
	const { repo, address } = await setup("/cards?group=g3", {
		before: async (r) => {
			await r.saveLimitGroup({
				id: "g3",
				name: "Spare",
				limit: 1_000_00,
				owner: "RI",
			})
		},
	})
	expect(sheet()?.inUse).toBe(false)
	const group = sheet()?.group
	sheet()?.dispatchEvent(new CustomEvent("delete-group", { detail: { group } }))
	await settle(5)
	expect((await repo.listLimitGroups()).map((g) => g.id)).toEqual(["g1", "g2"])
	expect(sheet()).toBeNull()
	expect(address.calls).toEqual(["replace /cards"])
})

test("a group added through the sheet is stored with a valid colour", async () => {
	const { repo } = await setup("/cards?newGroup=1")
	await settle()
	const el = sheet()
	const root = el?.shadowRoot as ShadowRoot
	const set = (name: string, value: string) => {
		const input = root.querySelector<HTMLInputElement>(`input[name=${name}]`)
		if (!input) throw new Error(name)
		input.value = value
		input.dispatchEvent(new Event("input"))
	}
	set("name", "Coloured")
	set("limit", "5000")
	root.querySelector<HTMLElement>('[data-owner="KC"]')?.click()
	await el?.updateComplete
	root.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }))
	await settle(5)
	const saved = (await repo.listLimitGroups()).find((g) => g.name === "Coloured")
	expect(toGroupColor(saved?.color)).not.toBeNull()
})

test("Add group pushes ?newGroup=1 and saves the new group, then closes", async () => {
	const { root, repo, address } = await setup()
	panels(root)?.dispatchEvent(new CustomEvent("add-group"))
	await settle()
	expect(address.calls).toEqual(["push /cards?newGroup=1"])
	expect(sheet()?.group).toBeNull()
	sheet()?.dispatchEvent(
		new CustomEvent("save-group", {
			detail: { id: "ignored", name: "New", limit: 20_000_00, owner: "RI" },
		}),
	)
	await settle(5)
	const saved = (await repo.listLimitGroups()).find((g) => g.name === "New")
	expect(saved?.limit).toBe(20_000_00)
	expect(address.calls.at(-1)).toBe("back")
	expect(sheet()).toBeNull()
	expect(panels(root)?.panels).toHaveLength(3)
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
	const { root, address } = await setup("/cards?newGroup=1", {
		repo,
		skipSeed: true,
	})
	const detail = { id: "x", name: "New", limit: 20_000_00, owner: "RI" }
	sheet()?.dispatchEvent(new CustomEvent("save-group", { detail }))
	await settle(5)
	expect(sheet()).not.toBeNull()
	expect(sheet()?.group).toBeNull()
	expect(sheet()?.error).toContain("Could not save that limit group.")
	expect(sheet()?.busy).toBe(false)
	expect(address.calls).toEqual([])
	// The page's banner leaves the reason to the sheet it failed in.
	expect(root.querySelector("cc-error-banner")?.message ?? "").toBe("")
	sheet()?.dispatchEvent(new CustomEvent("save-group", { detail: { ...detail, id: "y" } }))
	await settle(5)
	expect(repo.tried).toHaveLength(2)
	expect(repo.tried[0]).toBe(repo.tried[1])
	expect(sheet()).toBeNull()
	expect(address.calls).toEqual(["replace /cards"])
})

test("closing the sheet after a failed save leaves the banner empty", async () => {
	const repo = new FlakyGroupRepository()
	await seed(repo)
	repo.failures = 1
	const { root } = await setup("/cards?newGroup=1", { repo, skipSeed: true })
	const detail = { id: "x", name: "New", limit: 20_000_00, owner: "RI" }
	sheet()?.dispatchEvent(new CustomEvent("save-group", { detail }))
	await settle(5)
	expect(sheet()?.error).toContain("disk is full")
	sheet()?.dispatchEvent(new CustomEvent("close"))
	await settle(5)
	expect(sheet()).toBeNull()
	expect(root.querySelector("cc-error-banner")?.message ?? "").toBe("")
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
	const { root } = await setup("/cards?newGroup=1", { repo, skipSeed: true })
	const detail = { id: "x", name: "New", limit: 20_000_00, owner: "RI" }
	sheet()?.dispatchEvent(new CustomEvent("save-group", { detail }))
	await settle(5)
	sheet()?.dispatchEvent(new CustomEvent("save-group", { detail }))
	await settle(5)
	expect(sheet()?.busy).toBe(true)
	expect(root.querySelector("cc-error-banner")?.message ?? "").toBe("")
	repo.release()
	await settle(5)
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
	const { root, address } = await setup("/cards?group=g2", { repo })
	sheet()?.dispatchEvent(new CustomEvent("save-group", { detail: { ...G2, name: "SCB 2" } }))
	await settle()
	panels(root)?.dispatchEvent(new CustomEvent("open-group", { detail: { id: "g1" } }))
	await settle()
	expect(address.calls).toEqual([])
	repo.release()
	await settle(5)
	expect(sheet()).toBeNull()
	expect(address.now()).toBe("/cards")
})

test("an edited group saves under its own id", async () => {
	const { repo } = await setup("/cards?group=g2")
	sheet()?.dispatchEvent(new CustomEvent("save-group", { detail: { ...G2, name: "SCB 2" } }))
	await settle(5)
	expect((await repo.listLimitGroups()).find((g) => g.id === "g2")?.name).toBe("SCB 2")
	expect(sheet()).toBeNull()
})

test("the location reset notice shows once and can be dismissed", async () => {
	const storage = memoryStorage()
	storage.setItem(MIGRATION_KEY, JSON.stringify(["Old card"]))
	const { root } = await setup("/cards", { storage })
	const notice = root.querySelector('[data-testid="location-reset"]')
	expect(flatText(notice)).toContain("Old card")
	notice?.querySelector("button")?.click()
	await settle()
	expect(root.querySelector('[data-testid="location-reset"]')).toBeNull()
	expect(storage.getItem(MIGRATION_KEY)).toBeNull()
})

test("a language switch re-renders the page in place", async () => {
	const { root } = await setup()
	setLocale("th")
	await settle()
	expect(flatText(root.querySelector("h1"))).toBe("บัตร")
	expect(flatText(root.querySelector('[data-action="add-card"]'))).toBe("เพิ่มบัตร")
	setLocale("en")
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
	const { root, address } = await setup("/cards", { repo })
	repo.hold = true
	panels(root)?.dispatchEvent(new CustomEvent("open-group", { detail: { id: "g2" } }))
	await settle()
	sheet()?.dispatchEvent(new CustomEvent("save-group", { detail: { ...G2, name: "SCB 2" } }))
	await settle()
	expect(sheet()?.busy).toBe(true)
	address.bar.back() // the reader's Back while the write is pending
	await settle()
	repo.release()
	await settle(5)
	expect(address.calls.filter((c) => c === "back")).toHaveLength(1)
	expect(address.now()).toBe("/cards")
	expect(sheet()).toBeNull()
	expect((await repo.listLimitGroups()).find((g) => g.id === "g2")?.name).toBe("SCB 2")
})

test("?group=new opens the group whose id is new; ?newGroup=1 opens the blank sheet", async () => {
	await setup("/cards?group=new", {
		before: async (r) => {
			await r.saveLimitGroup({
				id: "new",
				name: "Odd",
				limit: 1_00,
				owner: "RI",
			})
		},
	})
	expect(sheet()?.group?.name).toBe("Odd")
	await setup("/cards?newGroup=1")
	expect(sheet()?.group).toBeNull()
	expect(sheet()).not.toBeNull()
})

test("?ungrouped=1 lists only cards with no stored group, and shows a chip for it", async () => {
	const { root } = await setup("/cards?ungrouped=1", {
		before: async (r) => {
			const { limitGroupId: _, ...loose } = card("N")
			await r.saveCard(loose)
			await r.saveCard(card("O", { limitGroupId: "gone" }))
		},
	})
	const ids = [...(list(root)?.shadowRoot?.querySelectorAll("a[data-card]") ?? [])].map((a) =>
		a.getAttribute("data-card"),
	)
	expect(ids.sort()).toEqual(["N", "O"])
	expect(root.textContent).toContain("Not in a group")
})
