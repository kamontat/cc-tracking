import type { Card, Purchase } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import CardPage from "#components/organisms/CardPage.svelte"
import { closeDateOf, periodOfPurchase } from "#lib/domain/cycle"
import { addDays, addPeriods, today } from "#lib/domain/date"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository } from "#lib/storage/repository"
import { seedLocations } from "#lib/storage/seed-locations"
import { payAddress } from "#lib/ui/pay-address"

/**
 * The card page's island (prototype `vCard`). Ported from the legacy route's tests; where those
 * read a child element's properties, these read what the child draws, and drive the real sheet,
 * statements and More menu.
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

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
}

// 70 days ago is well outside the current period, so this purchase always lands in a statement
// that is already closed, regardless of what "today" is when the test runs.
const purchaseDate = addDays(today(), -70)
const period = periodOfPurchase(card.cycle, purchaseDate)
const purchase: Purchase = { id: "a", cardId: "kbank", date: purchaseDate, amount: 35_000, note: "fuel" }

const list = (id: string, status: "draft" | "sent" | "saved", cards: string[]) => ({
	id,
	date: "2026-10-01",
	status,
	lines: cards.map((cardId) => ({ cardId, amount: 1_000 })),
})

/** A repository whose savePurchase always rejects, to exercise the failure path in isolation. */
class RejectingPurchaseRepository extends InMemoryRepository {
	override savePurchase(): Promise<void> {
		return Promise.reject(new Error("disk is full"))
	}
}

/** A repository whose deletePurchase always rejects, to exercise the failure path in isolation. */
class RejectingDeleteRepository extends InMemoryRepository {
	override deletePurchase(): Promise<void> {
		return Promise.reject(new Error("disk is full"))
	}
}

/** Where the page went after a delete, through its `navigate` seam. */
let visited: string[] = []

const open = async (repo: InMemoryRepository, id: string | null = "kbank") => {
	// As startup does on a real load: the default records, ticked from the stored setting.
	await seedLocations(repo, { getItem: () => null, setItem: () => {} })
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	visited = []
	mounted = mount(CardPage, {
		target: document.body,
		props: {
			open: async () => ({ ok: true as const, repo }),
			search: () => (id === null ? "" : `?id=${encodeURIComponent(id)}`),
			navigate: (url: string) => visited.push(url),
		},
	})
	await settle()
	return document.body
}

const banner = () => text($(".error-banner p"))

const press = async (selector: string) => {
	const target = $(selector)
	if (!target) throw new Error(`no ${selector}`)
	target.click()
	await settle()
}

/** Unfolds a statement's row. */
const unfold = (target: string) => press(`.card-statements [data-period="${target}"] button.head`)

const sheet = () => $("dialog input[name=amount]")?.closest("dialog") ?? null

/** Unfolds the statement and opens the purchase in the sheet. */
const openSheet = async (purchaseId = "a", target = period) => {
	await unfold(target)
	await press(`[data-purchase="${purchaseId}"] [data-action="edit-purchase"]`)
	if (!sheet()) throw new Error("the purchase sheet did not open")
}

const openAddSheet = async () => {
	await press('[data-action="add-purchase"]')
	if (!sheet()) throw new Error("the add sheet did not open")
}

const setField = async (name: string, value: string) => {
	const input = $<HTMLInputElement>(`dialog input[name="${name}"]`)
	if (!input) throw new Error(`no ${name} field`)
	input.value = value
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

const submitSheet = async () => {
	$("dialog form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
}

const closeSheet = async () => {
	await press("dialog [data-action=close]")
	await exit()
}

/** The More menu's item buttons by action, in order. */
const menuActions = async () => {
	await press(".sub-header button.more")
	const actions = [...document.querySelectorAll(".sub-header .more-menu button")].map((b) =>
		b.getAttribute("data-action"),
	)
	await press(".sub-header button.more")
	return actions
}

/** Opens the More menu and presses its buttons in turn. */
const pick = async (...actions: string[]) => {
	await press(".sub-header button.more")
	for (const action of actions) await press(`.sub-header [data-action="${action}"]`)
	await settle()
}

const stats = () => [...document.querySelectorAll(".card-hero .stats .stat b")].map(text)

test("a sub-header names the card and where it is kept, with Edit leading to the card form", async () => {
	const repo = new InMemoryRepository()
	await repo.saveLimitGroup({ id: "g1", name: "Pool", limit: 100_000_00, owner: "RI" })
	await repo.saveCard({ ...card, id: "k b", limitGroupId: "g1" })
	await open(repo, "k b")

	const header = $(".sub-header")
	expect(header?.querySelector('a[data-action="back"]')?.getAttribute("href")).toBe("/cards")
	expect(text(header?.querySelector("h1 .sub-header__title"))).toBe("KBank Visa · RI (4821)")
	expect(text(header?.querySelector("h1 small"))).toBe("k b · Kept in Krabi")
	const edit = header?.querySelector('a[data-action="edit"]')
	expect(edit?.getAttribute("href")).toBe("/card/edit?id=k%20b")
	expect(text(edit)).toBe("Edit")
	expect(header?.querySelector(".sub-header__actions button.more")).not.toBeNull()
})

test("More: Archive card archives the stored card and stays on its page", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	await open(repo)
	expect(await menuActions()).toEqual(["archive", "delete"])
	await press(".sub-header button.more")
	expect(text($('.sub-header [data-action="archive"]'))).toBe("Archive card")
	await press('.sub-header [data-action="archive"]')
	expect((await repo.getCard("kbank"))?.archived).toBe(true)
	expect(visited).toEqual([])
	expect([...document.querySelectorAll(".card-badges .badge")].map(text)).toEqual(["Archived"])
})

test("More: Unarchive card on an archived one", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard({ ...card, archived: true })
	await open(repo)
	await press(".sub-header button.more")
	expect(text($('.sub-header [data-action="archive"]'))).toBe("Unarchive card")
	await press('.sub-header [data-action="archive"]')
	expect((await repo.getCard("kbank"))?.archived).toBe(false)
})

test("More: a failed archive says why in the banner", async () => {
	class FailingSave extends InMemoryRepository {
		override saveCard(value: Card): Promise<void> {
			if (value.archived) return Promise.reject(new Error("disk is full"))
			return super.saveCard(value)
		}
	}
	const repo = new FailingSave()
	await repo.saveCard(card)
	await open(repo)
	await pick("archive")
	expect((await repo.getCard("kbank"))?.archived).toBe(false)
	expect(banner()).toContain("Could not archive the card.")
})

test("More: Delete card asks twice, naming the card, then goes to Cards", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	await repo.savePurchaseList(list("old", "saved", ["kbank"]))
	await open(repo)
	await pick("delete")
	expect(text($(".sub-header .ask"))).toBe("Delete KBank Visa?")
	expect(await repo.getCard("kbank")).not.toBeNull()
	await press('.sub-header [data-action="confirm"]')
	expect(await repo.getCard("kbank")).toBeNull()
	expect(visited).toEqual(["/cards"])
})

test("More: no Delete card while the card has a purchase", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	await repo.savePurchase(purchase)
	await open(repo)
	expect(await menuActions()).toEqual(["archive"])
})

test("More: no Delete card while a draft or a sent list holds it", async () => {
	for (const status of ["draft", "sent"] as const) {
		const repo = new InMemoryRepository()
		await repo.saveCard(card)
		await repo.savePurchaseList(list(status, status, ["kbank"]))
		await open(repo)
		expect(await menuActions()).toEqual(["archive"])
	}
})

test("More: a refused delete stays, with storage's reason, and Delete card goes", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	await open(repo)
	// Raced in after the page loaded: the button showed, storage still says no.
	await repo.savePurchase(purchase)
	await pick("delete", "confirm")
	expect(visited).toEqual([])
	expect(await repo.getCard("kbank")).not.toBeNull()
	expect(banner()).toContain("Could not delete the card.")
	expect(await menuActions()).toEqual(["archive"])
})

test("badges an archived or supplementary card under the header", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard({ ...card, archived: true, supplementary: true })
	await open(repo)
	expect([...document.querySelectorAll(".card-badges .badge")].map(text)).toEqual(["Archived", "Supplementary card"])
})

test("the hero shows the group's room, shared with its siblings, this card's debt and the next bill", async () => {
	const repo = new InMemoryRepository()
	await repo.saveLimitGroup({ id: "pool", name: "KBank account", limit: 500_000 })
	await repo.saveCard({ ...card, limitGroupId: "pool" })
	// A sibling on the same pool: its spending comes out of this card's room too.
	await repo.saveCard({ ...card, id: "scb", name: "SCB", limitGroupId: "pool" })
	await repo.savePurchase(purchase)
	await repo.savePurchase({ ...purchase, id: "b", cardId: "scb", amount: 10_000 })
	await open(repo)

	expect(text($(".card-hero .big"))).toBe("฿4,550.00")
	expect(text($(".card-hero .who"))).toContain("shared with scb")
	expect(stats().slice(0, 2)).toEqual(["฿350.00", "฿350.00"])
})

test("card payments settle the oldest statement first and leave credit past what is owed", async () => {
	const repo = new InMemoryRepository()
	await repo.saveLimitGroup({ id: "pool", name: "Pool", limit: 500_000 })
	await repo.saveCard({ ...card, limitGroupId: "pool" })
	await repo.savePurchase(purchase)
	await repo.saveCardPayment({ id: "pay1", cardId: "kbank", date: today(), amount: 15_000, status: "paid" })
	await open(repo)
	expect(stats()).toEqual(["฿200.00", "฿200.00", "Krabi"])
	await unfold(period)
	expect(text($(`.card-statements [data-period="${period}"]`))).toContain("150.00")

	await repo.saveCardPayment({ id: "pay2", cardId: "kbank", date: today(), amount: 30_000, status: "paid" })
	await open(repo)
	expect(stats()).toEqual(["฿0.00", "—", "฿100.00"])
})

test("Use on a list starts a list on this card, and Make a payment opens its next bill", async () => {
	const repo = new InMemoryRepository()
	await repo.saveLimitGroup({ id: "pool", name: "Pool", limit: 500_000 })
	await repo.saveCard({ ...card, id: "a b", limitGroupId: "pool" })
	await repo.savePurchase({ ...purchase, cardId: "a b" })
	await open(repo, "a b")

	const actions = $(".card-actions")
	const use = actions?.querySelector('a[data-action="use-on-list"]')
	expect(use?.getAttribute("href")).toBe("/list/new?card=a+b")
	expect(text(use)).toBe("Use on a list")
	const pay = actions?.querySelector('a[data-action="pay"]')
	expect(pay?.getAttribute("href")).toBe(payAddress({ cardId: "a b", amount: 35_000 }))
	expect(pay?.getAttribute("data-variant")).toBe("quiet")
	expect(text(pay)).toBe("Make a payment")
	expect(actions?.querySelector(".note")).toBeNull()
})

test("a card kept at a place of its own that takes no purchases names that place", async () => {
	const repo = new InMemoryRepository()
	await repo.saveLimitGroup({ id: "pool", name: "Pool", limit: 500_000 })
	await repo.saveLocation({ id: "chiang-mai", name: "Chiang Mai", takesPurchases: false })
	await repo.saveCard({ ...card, location: "chiang-mai", limitGroupId: "pool" })
	await open(repo)

	const actions = $(".card-actions")
	expect(actions?.querySelector('[data-action="use-on-list"]')).toBeNull()
	expect(text(actions?.querySelector(".note"))).toMatch(/^Chiang Mai takes no new purchases/)
	expect(text($("h1 small"))).toBe(`${card.id} · Kept in Chiang Mai`)
	expect(stats().at(-1)).toBe("Chiang Mai")
})

test("a card kept where purchases are not ticked says so instead of Use on a list", async () => {
	const repo = new InMemoryRepository()
	await repo.saveLimitGroup({ id: "pool", name: "Pool", limit: 500_000 })
	await repo.saveCard({ ...card, location: "bangkok", limitGroupId: "pool" })
	await open(repo)

	const actions = $(".card-actions")
	expect(actions?.querySelector('[data-action="use-on-list"]')).toBeNull()
	expect(text(actions?.querySelector(".note"))).toBe(
		"Bangkok takes no new purchases, so this card isn't offered on lists. Tick it under Settings › Locations.",
	)
	expect(actions?.querySelector('[data-action="settings"]')?.getAttribute("href")).toBe("/settings/locations")
})

const NO_GROUP_NOTE = "Give this card a limit group (Edit) to use it on a list."

test("a card with no limit group says so instead of Use on a list", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	await open(repo)
	expect($('[data-action="use-on-list"]')).toBeNull()
	expect(text($(".card-actions .note"))).toBe(NO_GROUP_NOTE)
})

test("a card whose limit group was deleted says the same", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard({ ...card, limitGroupId: "gone" })
	await open(repo)
	expect($('[data-action="use-on-list"]')).toBeNull()
	expect(text($(".card-actions .note"))).toBe(NO_GROUP_NOTE)
})

test("an archived card says it is archived: archiving, not the place, is why", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard({ ...card, location: "bangkok", archived: true })
	await open(repo)
	expect(text($(".card-actions .note"))).toBe("This card is archived, so it isn't offered on lists.")
	expect($('[data-action="use-on-list"]')).toBeNull()
	expect($(".card-statements")).not.toBeNull()
})

test("the comment shows under the stats when set", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard({ ...card, comment: "spare card in the drawer" })
	await open(repo)
	expect(text($(".card-comment"))).toBe("spare card in the drawer")

	await repo.saveCard(card)
	await open(repo)
	expect($(".card-comment")).toBeNull()
})

const pooled = async (repo: InMemoryRepository, limit = 500_000) => {
	await repo.saveLimitGroup({ id: "pool", name: "Pool", limit })
	await repo.saveCard({ ...card, limitGroupId: "pool" })
}

test("the actions read Use on a list, Add purchase, Make a payment", async () => {
	const repo = new InMemoryRepository()
	await pooled(repo)
	await open(repo)
	const actions = [...document.querySelectorAll<HTMLElement>(".card-actions [data-action]")]
	expect(actions.map((el) => el.dataset["action"])).toEqual(["use-on-list", "add-purchase", "pay"])
	expect(actions.map(text)).toEqual(["Use on a list", "Add purchase", "Make a payment"])
})

test("a card that can't take a purchase shows the note instead of Add purchase", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	await open(repo)
	expect($('[data-action="add-purchase"]')).toBeNull()
	expect(text($(".card-actions .note"))).toBe(NO_GROUP_NOTE)
})

test("Add purchase opens a blank sheet on this card; a save stores it, stays and reloads", async () => {
	const repo = new InMemoryRepository()
	await pooled(repo)
	await open(repo)
	await openAddSheet()
	expect($<HTMLInputElement>('dialog input[name="amount"]')?.value).toBe("")
	expect(text($("dialog .card-panel"))).toContain("kbank) KBank Visa")
	await setField("amount", "100")
	await setField("note", "stamps")
	await submitSheet()

	expect(sheet()).toBeNull()
	expect(visited).toEqual([])
	const stored = await repo.listPurchases("kbank")
	expect(stored).toHaveLength(1)
	expect(stored[0]).toMatchObject({ cardId: "kbank", date: today(), amount: 10_000, note: "stamps" })
	expect(stored[0]?.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
	// Within the room, nothing more is said.
	expect($("[data-over-room]")).toBeNull()
	// The page reloaded: the hero counts the new purchase.
	expect(stats()[0]).toBe("฿100.00")
})

test("a purchase over the room is saved, and the page says by how much over which group", async () => {
	const repo = new InMemoryRepository()
	await pooled(repo, 50_000)
	await open(repo)
	await openAddSheet()
	await setField("amount", "600")
	await submitSheet()

	expect(await repo.listPurchases("kbank")).toHaveLength(1)
	expect(text($("[data-over-room]"))).toBe("Saved. It went ฿100.00 over the room of Pool.")
	// Opening the sheet again clears it.
	await openAddSheet()
	expect($("[data-over-room]")).toBeNull()
})

test("a failed add keeps the sheet, the typing and the reason", async () => {
	const repo = new RejectingPurchaseRepository()
	await pooled(repo)
	await open(repo)
	await openAddSheet()
	await setField("amount", "100")
	await submitSheet()
	expect(sheet()).not.toBeNull()
	expect(text($("dialog .error-banner"))).toContain("Could not save the purchase.")
	expect($<HTMLInputElement>('dialog input[name="amount"]')?.value).toBe("100")
	expect(text($(".sub-header ~ .error-banner p"))).toBe("")
})

test("an unknown card id shows a message instead of a blank page", async () => {
	await open(new InMemoryRepository(), "does-not-exist")
	expect(banner()).toContain("does-not-exist")
	expect($(".card-statements")).toBeNull()
	expect($('a[data-action="back"]')?.getAttribute("href")).toBe("/cards")
})

test("no card id at all shows a message instead of a blank page", async () => {
	await open(new InMemoryRepository(), null)
	expect(banner()).toContain("No card was selected.")
})

test('"Show older statements" reveals a period beyond the first twelve', async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	const farPeriod = addPeriods(periodOfPurchase(card.cycle, today()), -12)
	await repo.savePurchase({
		id: "far",
		cardId: "kbank",
		date: closeDateOf(card.cycle, farPeriod),
		amount: 5_000,
		note: "vintage typewriter",
	})
	await open(repo)

	expect($(`[data-period="${farPeriod}"]`)).toBeNull()
	const showOlder = $("[data-action='show-older']")
	expect(text(showOlder)).toBe("Show older statements")
	expect(showOlder?.getAttribute("data-variant")).toBe("quiet")
	await press("[data-action='show-older']")

	await unfold(farPeriod)
	expect(text($(`[data-period="${farPeriod}"]`))).toContain("vintage typewriter")
})

test("lists a statement ahead of the open one when a purchase is dated into it", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	const aheadPeriod = addPeriods(periodOfPurchase(card.cycle, today()), 2)
	await repo.savePurchase({
		...purchase,
		id: "ahead",
		date: closeDateOf(card.cycle, aheadPeriod),
		note: "booked ahead",
	})
	await open(repo)

	expect($(".card-statements [data-period]")?.getAttribute("data-period")).toBe(aheadPeriod)
	await unfold(aheadPeriod)
	expect(text($(`[data-period="${aheadPeriod}"]`))).toContain("booked ahead")
})

test("deleting a purchase asks twice, then removes it", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	await repo.savePurchase(purchase)
	await open(repo)

	await unfold(period)
	await press('[data-action="delete-purchase"]')
	expect(await repo.listPurchases("kbank")).toEqual([purchase])
	await press('[data-action="confirm-delete"]')

	expect(banner()).toBe("")
	expect(await repo.listPurchases("kbank")).toEqual([])
})

test("a failed delete leaves a message in the banner and keeps the purchase", async () => {
	const repo = new RejectingDeleteRepository()
	await repo.saveCard(card)
	await repo.savePurchase(purchase)
	await open(repo)

	await unfold(period)
	await press('[data-action="delete-purchase"]')
	await press('[data-action="confirm-delete"]')

	expect(banner()).toContain("disk is full")
	expect(await repo.listPurchases("kbank")).toEqual([purchase])
})

test("Edit opens the purchase sheet; a save keeps addedAt and closes it once written", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	await repo.savePurchase({ ...purchase, addedAt: "2026-10-01T00:00:00.000Z" })
	await open(repo)

	await openSheet()
	expect($<HTMLInputElement>('dialog input[name="note"]')?.value).toBe("fuel")
	const newDate = addDays(purchaseDate, 1)
	await setField("date", newDate)
	await setField("amount", "500")
	await setField("note", "tyres")
	await submitSheet()

	expect(banner()).toBe("")
	expect(sheet()).toBeNull()
	expect(await repo.listPurchases("kbank")).toEqual([
		{ id: "a", cardId: "kbank", date: newDate, amount: 50_000, note: "tyres", addedAt: "2026-10-01T00:00:00.000Z" },
	])
})

test("an archived card's purchases can still be edited", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard({ ...card, archived: true })
	await repo.savePurchase(purchase)
	await open(repo)
	await openSheet()
	await setField("amount", "1")
	await submitSheet()
	expect((await repo.listPurchases("kbank"))[0]?.amount).toBe(100)
})

test("closing the sheet leaves the purchase as it was", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	await repo.savePurchase(purchase)
	await open(repo)
	await openSheet()
	await closeSheet()
	expect(sheet()).toBeNull()
	expect(await repo.listPurchases("kbank")).toEqual([purchase])
})

test("a failed edit keeps the sheet open with the message, the typing and the old purchase", async () => {
	const repo = new RejectingPurchaseRepository()
	await repo.saveCard(card)
	await InMemoryRepository.prototype.savePurchase.call(repo, purchase)
	await open(repo)

	await openSheet()
	await setField("note", "typed")
	await submitSheet()

	expect(sheet()).not.toBeNull()
	expect(text($("dialog .error-banner"))).toContain("disk is full")
	expect($<HTMLInputElement>('dialog input[name="note"]')?.value).toBe("typed")
	expect(await repo.listPurchases("kbank")).toEqual([purchase])
})

test("closing the sheet after a failed edit leaves the banner empty", async () => {
	const repo = new RejectingPurchaseRepository()
	await repo.saveCard(card)
	await InMemoryRepository.prototype.savePurchase.call(repo, purchase)
	await open(repo)

	await openSheet()
	await submitSheet()
	await closeSheet()

	expect(sheet()).toBeNull()
	expect(banner()).toBe("")
})

test("a failed edit never puts its reason in the page banner, not even for a moment", async () => {
	const repo = new RejectingPurchaseRepository()
	await repo.saveCard(card)
	await InMemoryRepository.prototype.savePurchase.call(repo, purchase)
	await open(repo)
	const seen: string[] = []
	const observer = new MutationObserver(() => {
		const outside = [...document.querySelectorAll(".error-banner")].filter((b) => !b.closest("dialog"))
		for (const b of outside) seen.push(text(b))
	})
	observer.observe(document.body, { subtree: true, childList: true, characterData: true })

	await openSheet()
	await submitSheet()
	observer.disconnect()

	expect(seen.filter(Boolean)).toEqual([])
})

test("renders in the chosen language and re-renders on a switch", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	await repo.savePurchase(purchase)
	const far = addPeriods(periodOfPurchase(card.cycle, today()), -12)
	await repo.savePurchase({ ...purchase, id: "far", date: closeDateOf(card.cycle, far) })
	await open(repo)
	expect(document.body.textContent).toContain("Show older statements")
	expect(text($(".card-statements h2"))).toBe("Statements")

	setLocale("th")
	await settle()
	expect(document.body.textContent).toContain("ดูใบแจ้งยอดเก่ากว่านี้")
	expect(text($(".card-statements h2"))).toBe("ใบแจ้งยอด")
})

/** Opens the page on a pooled card and adds a purchase ฿100 over the room, so the note shows. */
const overRoomShown = async (repo: InMemoryRepository, beforeSubmit?: () => Promise<void>) => {
	await pooled(repo, 50_000)
	await repo.savePurchase(purchase)
	await open(repo)
	await openAddSheet()
	await setField("amount", "600")
	await beforeSubmit?.()
	await submitSheet()
	expect($("[data-over-room]")).not.toBeNull()
}

test("the over-room note clears when the card is archived", async () => {
	const repo = new InMemoryRepository()
	await overRoomShown(repo)
	await pick("archive")
	expect((await repo.getCard("kbank"))?.archived).toBe(true)
	expect($("[data-over-room]")).toBeNull()
})

test("the over-room note clears when the card is unarchived", async () => {
	const repo = new InMemoryRepository()
	// Archived elsewhere while the sheet was open, so the page reloads on an archived card.
	await overRoomShown(repo, async () => {
		await repo.saveCard({ ...card, limitGroupId: "pool", archived: true })
	})
	await press(".sub-header button.more")
	expect(text($('.sub-header [data-action="archive"]'))).toBe("Unarchive card")
	await press('.sub-header [data-action="archive"]')
	expect((await repo.getCard("kbank"))?.archived).toBe(false)
	expect($("[data-over-room]")).toBeNull()
})

test("the over-room note clears when a purchase is edited", async () => {
	const repo = new InMemoryRepository()
	await overRoomShown(repo)
	await openSheet()
	expect($("[data-over-room]")).toBeNull()
	await setField("note", "diesel")
	await submitSheet()
	expect((await repo.listPurchases("kbank")).map((p) => p.note)).toContain("diesel")
	expect($("[data-over-room]")).toBeNull()
})

test("the over-room note clears when a purchase is deleted", async () => {
	const repo = new InMemoryRepository()
	await overRoomShown(repo)
	await unfold(period)
	await press('[data-purchase="a"] [data-action="delete-purchase"]')
	await press('[data-action="confirm-delete"]')
	expect((await repo.listPurchases("kbank")).map((p) => p.id)).not.toContain("a")
	expect($("[data-over-room]")).toBeNull()
})

test('"Show older statements" is absent when nothing is older, and again once all is shown', async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	await repo.savePurchase(purchase)
	await open(repo)
	expect($("[data-action='show-older']")).toBeNull()

	const far = addPeriods(periodOfPurchase(card.cycle, today()), -12)
	await repo.savePurchase({ ...purchase, id: "far", date: closeDateOf(card.cycle, far) })
	await open(repo)
	expect($("[data-action='show-older']")).not.toBeNull()
	await press("[data-action='show-older']")
	expect($("[data-action='show-older']")).toBeNull()
})

test("a store that won't open shows why, with Reload, and no card", async () => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(CardPage, {
		target: document.body,
		props: { open: async () => ({ ok: false as const, message: () => "Storage is off." }), search: () => "?id=kbank" },
	})
	await settle()
	expect(banner()).toBe("Storage is off.")
	expect($(".card-hero")).toBeNull()
})
