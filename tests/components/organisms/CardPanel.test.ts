import type { Card, Purchase } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import CardPanel from "#components/organisms/CardPanel.svelte"
import { periodOfPurchase } from "#lib/domain/cycle"
import { addDays, today } from "#lib/domain/date"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository } from "#lib/storage/repository"
import { seedLocations } from "#lib/storage/seed-locations"
import { RecordPanel } from "#lib/ui/record-panel.svelte"
import { fakeHistory } from "../../lib/ui/fake-history"

/**
 * The card panel (RD-23, RD-24): what `/card` shows, fitted to the detail panel, and the card's
 * forms in its place -- edit, a new card, a payment, a purchase -- each with ‹ back to the card.
 */
let mounted: ReturnType<typeof mount> | undefined
let stop: (() => void) | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	stop?.()
	stop = undefined
	document.body.innerHTML = ""
})

const settle = async (rounds = 20) => {
	for (let i = 0; i < rounds; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)

const card: Card = {
	id: "12.3",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g1",
}

const purchaseDate = addDays(today(), -70)
const purchase: Purchase = { id: "a", cardId: "12.3", date: purchaseDate, amount: 35_000, note: "fuel" }

const stocked = async () => {
	const repo = new InMemoryRepository()
	await seedLocations(repo, { getItem: () => null, setItem: () => {} })
	await repo.saveLimitGroup({ id: "g1", name: "Pool", limit: 100_000_00, owner: "RI" })
	await repo.saveCard(card)
	return repo
}

/** Mounts the panel over a page at `start`, with `asks` answering the discard question. */
const show = async (repo: InMemoryRepository, start = "/cards?card=12.3", answer = true) => {
	const history = fakeHistory(start)
	let asked = 0
	const panel = new RecordPanel({
		address: history.bar,
		path: "/cards",
		kinds: ["card"],
		ask: () => {
			asked++
			return answer
		},
	})
	stop = panel.start()
	let changes = 0
	let ids = 0
	mounted = mount(CardPanel, {
		target: document.body,
		props: {
			panel,
			open: async () => ({ ok: true as const, repo }),
			newId: () => `id-${++ids}`,
			onchange: () => {
				changes++
			},
		},
	})
	await settle()
	return { history, panel, changes: () => changes, asked: () => asked }
}

const press = async (selector: string) => {
	const target = $(selector)
	if (!target) throw new Error(`no ${selector}`)
	target.click()
	await settle()
}

const type = async (name: string, value: string) => {
	const input = $<HTMLInputElement>(`.detail-panel [name="${name}"]`)
	if (!input) throw new Error(`no ${name}`)
	input.value = value
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

const pickGroup = async (id: string) => {
	const select = $<HTMLSelectElement>('.detail-panel select[name="limitGroupId"]')
	if (!select) throw new Error("no limit group")
	select.value = id
	select.dispatchEvent(new Event("change", { bubbles: true }))
	await settle()
}

const submit = async () => {
	$(".detail-panel form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
}

const title = () => text($(".detail-panel__head h2"))

test("nothing opens without a card in the address", async () => {
	await show(await stocked(), "/cards")
	expect($(".detail-panel")).toBeNull()
})

test("an unknown card opens nothing, and its key leaves the address", async () => {
	const { history, panel } = await show(await stocked(), "/cards?q=a&card=99")
	expect($(".detail-panel")).toBeNull()
	expect(panel.view).toBeNull()
	expect(history.now()).toBe("/cards?q=a")
})

test("the head names the card: its chip, title, id and place, Edit and More", async () => {
	await show(await stocked())
	const head = $(".detail-panel__head")
	expect(text(head?.querySelector(".mini"))).toBe("4821")
	expect(title()).toBe("KBank Visa · RI (4821)")
	expect(text(head?.querySelector(".detail-panel__detail"))).toBe("12.3 · Kept in Krabi")
	expect(head?.querySelector('button[data-action="edit"]')).not.toBeNull()
	expect(head?.querySelector("button.more")).not.toBeNull()
	expect(head?.querySelector('[data-action="panel-back"]')).toBeNull()
})

test("the body is the card page's: hero, actions and statements", async () => {
	const repo = await stocked()
	await repo.saveCard({ ...card, comment: "Pays fuel" })
	await repo.savePurchase(purchase)
	await show(repo)
	const body = $(".detail-panel__body")
	expect(body?.querySelector(".card-hero")).not.toBeNull()
	expect(text(body?.querySelector(".card-comment"))).toBe("Pays fuel")
	expect(body?.querySelector('a[data-action="use-on-list"]')?.getAttribute("href")).toBe("/list/new?card=12.3")
	expect(body?.querySelector('button[data-action="add-purchase"]')).not.toBeNull()
	expect(body?.querySelector('button[data-action="pay"]')).not.toBeNull()
	expect(body?.querySelector(".card-statements")).not.toBeNull()
	expect(body?.querySelector(`[data-period="${periodOfPurchase(card.cycle, purchaseDate)}"]`)).not.toBeNull()
})

test("Edit turns the panel into the card form; saving returns to the card", async () => {
	const repo = await stocked()
	const { history, changes } = await show(repo)
	await press('.detail-panel__head [data-action="edit"]')
	expect(title()).toBe("Edit card")
	expect(history.now()).toBe("/cards?card=12.3")
	expect($(".detail-panel form.card-form")).not.toBeNull()
	expect($('.detail-panel__head [data-action="panel-back"]')).not.toBeNull()
	await type("name", "KBank Gold")
	await submit()
	expect((await repo.getCard("12.3"))?.name).toBe("KBank Gold")
	expect(title()).toBe("KBank Gold · RI (4821)")
	expect($(".detail-panel form.card-form")).toBeNull()
	expect(changes()).toBe(1)
})

test("‹ and Cancel leave the card form for the card", async () => {
	await show(await stocked())
	await press('.detail-panel__head [data-action="edit"]')
	await press('.detail-panel__head [data-action="panel-back"]')
	expect($(".detail-panel .card-hero")).not.toBeNull()
	await press('.detail-panel__head [data-action="edit"]')
	await press('.detail-panel form [data-action="cancel"]')
	expect($(".detail-panel .card-hero")).not.toBeNull()
})

test("a changed form asks before × drops it, and stays when told no", async () => {
	const { asked } = await show(await stocked(), "/cards?card=12.3", false)
	await press('.detail-panel__head [data-action="edit"]')
	await type("name", "Something else")
	await press('.detail-panel__head [data-action="close-panel"]')
	expect(asked()).toBe(1)
	expect($<HTMLInputElement>('.detail-panel [name="name"]')?.value).toBe("Something else")
})

test("a blank form adds a card, and the address names it", async () => {
	const repo = await stocked()
	const { history, panel, changes } = await show(repo, "/cards")
	panel.blank("card")
	await settle()
	expect(title()).toBe("New card")
	expect($('.detail-panel__head [data-action="panel-back"]')).toBeNull()
	expect($('.detail-panel form [data-action="cancel"]')).toBeNull()
	await type("id", "51.4")
	await type("name", "SCB")
	await type("last4", "1111")
	await type("closeDay", "10")
	await type("dueOffsetDays", "15")
	await pickGroup("g1")
	await submit()
	expect((await repo.getCard("51.4"))?.name).toBe("SCB")
	expect(history.now()).toBe("/cards?card=51.4")
	expect(title()).toContain("SCB")
	expect(changes()).toBe(1)
})

test("a new card's id already stored is refused, the form kept", async () => {
	const repo = await stocked()
	const { panel } = await show(repo, "/cards")
	panel.blank("card")
	await settle()
	await type("id", "12.3")
	await type("name", "Twin")
	await type("last4", "2222")
	await type("closeDay", "10")
	await type("dueOffsetDays", "15")
	await pickGroup("g1")
	await submit()
	expect((await repo.getCard("12.3"))?.name).toBe("KBank Visa")
	expect(text($(".detail-panel .card-form .error-banner"))).toContain("12.3")
	expect(title()).toBe("New card")
})

test("Make a payment opens the pay form on the next bill; saving returns to the card", async () => {
	const repo = await stocked()
	await repo.savePurchase(purchase)
	const { changes } = await show(repo)
	await press('.detail-panel [data-action="pay"]')
	expect(title()).toBe("Make a payment")
	expect($('.detail-panel [data-action="change"]')).toBeNull()
	expect($<HTMLInputElement>('.detail-panel input[name="amount"]')?.value).toBe("350")
	await submit()
	const payments = await repo.listCardPayments("12.3")
	expect(payments).toHaveLength(1)
	expect(payments[0]).toMatchObject({ id: "id-1", amount: 35_000, status: "paid" })
	expect($(".detail-panel .card-hero")).not.toBeNull()
	expect(changes()).toBe(1)
})

test("a record opened straight on its pay form starts at the amount asked", async () => {
	const repo = await stocked()
	await repo.savePurchase(purchase)
	const { panel } = await show(repo, "/cards")
	panel.show({ kind: "card", id: "12.3" }, { name: "pay", arg: "12000" })
	await settle()
	expect($<HTMLInputElement>('.detail-panel input[name="amount"]')?.value).toBe("120")
})

test("Add purchase replaces the card; a purchase over the room is saved and said", async () => {
	const repo = await stocked()
	await repo.saveLimitGroup({ id: "g1", name: "Pool", limit: 100_00, owner: "RI" })
	const { changes } = await show(repo)
	await press('.detail-panel [data-action="add-purchase"]')
	expect(title()).toBe("Add purchase")
	await type("amount", "250")
	await submit()
	expect(await repo.listPurchases("12.3")).toHaveLength(1)
	expect($(".detail-panel .card-hero")).not.toBeNull()
	expect(text($(".detail-panel [data-over-room]"))).toBe("Saved. It went ฿150.00 over the room of Pool.")
	expect(changes()).toBe(1)
})

test("a statement's purchase is edited in the panel", async () => {
	const repo = await stocked()
	await repo.savePurchase(purchase)
	await show(repo)
	const target = periodOfPurchase(card.cycle, purchaseDate)
	await press(`.detail-panel .card-statements [data-period="${target}"] button.head`)
	await press('.detail-panel [data-purchase="a"] [data-action="edit-purchase"]')
	expect(title()).toBe("Edit purchase")
	expect($<HTMLInputElement>('.detail-panel input[name="amount"]')?.value).toBe("350")
	await type("amount", "400")
	await submit()
	expect((await repo.listPurchases("12.3"))[0]?.amount).toBe(40_000)
	expect($(".detail-panel .card-hero")).not.toBeNull()
})

test("More: Delete card closes the panel without asking", async () => {
	const repo = await stocked()
	const { history, asked, changes } = await show(repo)
	await press(".detail-panel__head button.more")
	await press('.detail-panel__head [data-action="delete"]')
	await press('.detail-panel__head [data-action="confirm"]')
	expect(asked()).toBe(0)
	expect(history.now()).toBe("/cards")
	expect(await repo.getCard("12.3")).toBeNull()
	expect($(".detail-panel")).toBeNull()
	expect(changes()).toBe(1)
})

test("More: Archive card archives it in place", async () => {
	const repo = await stocked()
	await show(repo)
	await press(".detail-panel__head button.more")
	await press('.detail-panel__head [data-action="archive"]')
	expect((await repo.getCard("12.3"))?.archived).toBe(true)
	expect([...document.querySelectorAll(".detail-panel .card-badges .badge")].map(text)).toEqual(["Archived"])
})

test("swapping to another card shows it", async () => {
	const repo = await stocked()
	await repo.saveCard({ ...card, id: "7", name: "SCB", last4: "9999" })
	const { panel } = await show(repo)
	panel.show({ kind: "card", id: "7" })
	await settle()
	expect(title()).toBe("SCB · RI (9999)")
})

test("the head follows a language switch", async () => {
	await show(await stocked())
	setLocale("th")
	await settle()
	expect(text($(".detail-panel__detail"))).toContain("12.3")
	expect(text($(".detail-panel__detail"))).not.toContain("Kept in")
})
