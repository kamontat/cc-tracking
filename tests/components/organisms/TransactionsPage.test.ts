import type { Card, PurchaseList } from "#lib/domain/types"
import type { AddressBar } from "#lib/ui/address-bar"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import TransactionsPage from "#components/organisms/TransactionsPage.svelte"
import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"

/**
 * Transactions' island: the ledger, the purchase lists and what is owed, with the view kept in
 * the address. Ported from the legacy route's tests; where those read a child element's
 * properties, these read what the child draws, and drive the real rows and sheet.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
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

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]

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

const list = (id: string, status: PurchaseList["status"], cards: string[]): PurchaseList => ({
	id,
	date: "2026-10-30",
	status,
	lines: cards.map((cardId) => ({ cardId, amount: 100_00 })),
	...(status === "sent" ? { sentAt: "2026-10-30T05:00:00Z" } : {}),
})

const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 })
	await repo.saveCard(card("A"))
	await repo.saveCard(card("B"))
	await repo.saveCard(card("Z", { archived: true }))
	for (const record of defaultLocations(DEFAULT_SETTINGS))
		await repo.saveLocation({ ...record, takesPurchases: record.id === "krabi" })
	await repo.savePurchase({ id: "p1", cardId: "A", date: "2026-10-30", amount: 1_000_00, note: "fuel" })
	await repo.savePurchase({ id: "p2", cardId: "B", date: "2026-10-31", amount: 250_00, note: "lunch" })
	await repo.saveCardPayment({ id: "c1", cardId: "A", date: "2026-10-31", amount: 300_00, status: "paid" })
	await repo.saveCardPayment({ id: "c2", cardId: "A", date: "2026-11-05", amount: 200_00, status: "planned" })
	await repo.savePurchaseList(list("w1", "sent", ["B"]))
}

/** An address bar that records every replace. */
const fakeBar = (start: string) => {
	let entry = start
	const written: string[] = []
	const bar: AddressBar = {
		search: () => entry,
		push: (url) => {
			entry = url.slice(url.indexOf("?") === -1 ? url.length : url.indexOf("?"))
		},
		replace: (url) => {
			const q = url.indexOf("?")
			entry = q === -1 ? "" : url.slice(q)
			written.push(entry)
		},
		onPop: () => () => {},
		length: () => 1,
		back: () => {},
	}
	return { bar, written }
}

const open = async (search = "", extra: (repo: Repository) => Promise<void> = async () => {}) => {
	setLocale("en")
	const repo = new InMemoryRepository()
	await seed(repo)
	await extra(repo)
	const { bar, written } = fakeBar(search)
	mounted = mount(TransactionsPage, {
		target: document.body,
		props: { open: async () => ({ ok: true, repo }), clock: CLOCK, address: bar },
	})
	await settle()
	return { repo, written }
}

const type = async (value: string) => {
	const input = $<HTMLInputElement>('input[name="q"]')
	if (!input) throw new Error("no search")
	input.value = value
	input.dispatchEvent(new Event("input"))
	await settle()
}

const press = async (el: Element | null | undefined) => {
	if (!el) throw new Error("nothing to press")
	;(el as HTMLElement).click()
	await settle()
}

/** The opened row's details. */
const shown = ".a-details:not([hidden])"
const ledgerRows = () => $$('.tx-body :is([data-item="purchase"], [data-item="payment"])')
const dayHeadings = () => $$("section.day h3").map((h) => text(h))

test("the default view shows the summary, upcoming and the ledger by day", async () => {
	const { written } = await open()
	expect($("h1")?.textContent).toBe("Transactions")
	expect($('[data-view="ledger"]')?.getAttribute("aria-pressed")).toBe("true")
	const summary = $('[data-testid="summary"]')
	expect(text(summary)).toContain("฿1,250.00")
	expect(text(summary)).toContain("฿300.00")
	expect($$('[data-item="waiting"]').map((el) => el.closest("[data-row]")?.getAttribute("data-row"))).toEqual([
		"list:w1",
	])
	expect($$('[data-item="planned"]').map((el) => el.closest("[data-row]")?.getAttribute("data-row"))).toEqual([
		"plan:A:c2",
	])
	expect(dayHeadings()).toHaveLength(2)
	expect(dayHeadings()[0]).toContain("31")
	// The card ledgers reach the rows: an opened purchase names its statement.
	await press($('[data-row="buy:A:p1"] .a-hit'))
	expect(text($(`[data-row="buy:A:p1"] ${shown} .a-say`))).not.toBe("")
	expect(written).toEqual([])
})

test("searching writes ?q= and hides the summary", async () => {
	const { written } = await open()
	await type("fuel")
	expect(written.at(-1)).toBe("?q=fuel")
	expect($('[data-testid="summary"]')).toBeNull()
	expect($(".result-head")).not.toBeNull()
	expect(ledgerRows()).toHaveLength(1)
})

test("removing a chip drops that filter", async () => {
	const { written } = await open("?type=payment&card=A")
	expect(ledgerRows()).toHaveLength(1)
	await press($('[data-chip="type:payment"]'))
	expect(written.at(-1)).toBe("?card=A")
	expect(ledgerRows()).toHaveLength(2)
	await press($('[data-chip="card:A"]'))
	expect(written.at(-1)).toBe("")
})

test("the filter sheet applies a filter and a sort", async () => {
	const { written } = await open()
	await press($('[data-action="filter"]'))
	await press($('dialog [data-type="payment"]'))
	await press($('dialog [data-action="apply"]'))
	await exit()
	expect(written.at(-1)).toBe("?type=payment")
	expect($("dialog")).toBeNull()
	expect(ledgerRows()).toHaveLength(1)
})

test("the Lists view filters by status chip", async () => {
	const { written } = await open("?view=lists")
	expect($$('.tx-body [data-row^="list:"]')).toHaveLength(1)
	await press($('[data-status="saved"]'))
	expect(written.at(-1)).toBe("?view=lists&status=saved")
	expect($('[data-status="saved"]')?.getAttribute("aria-pressed")).toBe("true")
	expect($$('.tx-body [data-row^="list:"]')).toHaveLength(0)
})

test("the Lists view's Confirm saves a sent list after the second step", async () => {
	const { repo } = await open("?view=lists")
	await press($('[data-row="list:w1"] .a-hit'))
	await press($(`${shown} [data-action="confirm-list"]`))
	expect((await repo.listPurchaseLists()).find((l) => l.id === "w1")?.status).toBe("sent")
	await press($('[data-action="save-list"]'))
	expect((await repo.listPurchaseLists()).find((l) => l.id === "w1")?.status).toBe("saved")
})

test("the Lists view's Delete removes a draft in one step", async () => {
	const { repo } = await open("?view=lists", async (r) => {
		await r.savePurchaseList(list("d9", "draft", ["A"]))
	})
	await press($('[data-row="list:d9"] .a-hit'))
	await press($(`${shown} [data-action="delete-draft"]`))
	expect((await repo.listPurchaseLists()).map((l) => l.id)).toEqual(["w1"])
	expect($('[data-row="list:d9"]')).toBeNull()
})

test("the switch changes the view and the address", async () => {
	const { written } = await open()
	await press($('[data-view="lists"]'))
	expect(written.at(-1)).toBe("?view=lists")
	expect($('[data-status="draft"]')).not.toBeNull()
	expect($("fieldset.tx-switch")).not.toBeNull()
})

test("with Owed open the Ledger button is marked current for wide screens", async () => {
	await open("?view=owed")
	expect($('.tx-switch [data-view="ledger"]')?.hasAttribute("data-desktop-current")).toBe(true)
	if (mounted) unmount(mounted)
	mounted = undefined
	await open("?view=lists")
	expect($('.tx-switch [data-view="ledger"]')?.hasAttribute("data-desktop-current")).toBe(false)
})

test("Owed tiles lead to the payment sheet on the card, with each group's room", async () => {
	await open("?view=owed")
	const tile = $<HTMLAnchorElement>('.tx-owed a[data-card="A"]')
	expect(tile?.getAttribute("href")).toBe("/pay?card=A")
	expect(tile?.querySelector(".rail")?.getAttribute("aria-label")).toMatch(/of the limit used$/)
})

test("Mark paid moves a plan into the ledger and lowers owed", async () => {
	const { repo } = await open()
	const owedBefore = text($('.tx-owed a[data-card="A"]'))
	await press($('[data-item="planned"]'))
	await press($('[data-action="mark-paid"]'))
	const planned = (await repo.listCardPayments("A")).find((p) => p.id === "c2")
	expect(planned).toMatchObject({ id: "c2", status: "paid", date: "2026-10-31" })
	expect($('[data-item="planned"]')).toBeNull()
	expect(text($('.tx-owed a[data-card="A"]'))).not.toBe(owedBefore)
})

test("Confirm saves a waiting list as is: every line made, under the list's own ids", async () => {
	const { repo } = await open("", async (r) => {
		await r.savePurchaseList({ ...list("w1", "sent", ["B"]), lines: [{ cardId: "B", amount: 120_00, note: "gift" }] })
	})
	await press($('[data-item="waiting"]'))
	await press($('[data-action="confirm-list"]'))
	// The first tap only asks; nothing is written yet.
	expect(await repo.listPurchases("B")).toHaveLength(1)
	await press($('[data-action="save-list"]'))
	expect((await repo.listPurchaseLists()).find((l) => l.id === "w1")?.status).toBe("saved")
	expect((await repo.listPurchases("B")).filter((p) => p.id.startsWith("w1-"))).toEqual([
		expect.objectContaining({ id: "w1-0", cardId: "B", date: "2026-10-30", amount: 120_00, note: "gift" }),
	])
	expect($('[data-item="waiting"]')).toBeNull()
})

test("Confirm refuses a list no longer waiting and writes nothing", async () => {
	const { repo } = await open()
	await repo.savePurchaseList(list("w1", "draft", ["B"]))
	await press($('[data-item="waiting"]'))
	await press($('[data-action="confirm-list"]'))
	await press($('[data-action="save-list"]'))
	expect((await repo.listPurchases("B")).filter((p) => p.id.startsWith("w1-"))).toEqual([])
	expect(text($(".error-banner"))).toContain("no longer waiting")
	// The list is no longer waiting, so its row goes from Upcoming.
	expect($('[data-item="waiting"]')).toBeNull()
})

test("deleting a payment needs the second step", async () => {
	const { repo } = await open()
	await press($('[data-item="payment"]'))
	await press($(`${shown} [data-action="delete"]`))
	expect(await repo.listCardPayments("A")).toHaveLength(2)
	await press($(`${shown} [data-action="confirm-delete"]`))
	expect((await repo.listCardPayments("A")).map((p) => p.id)).toEqual(["c2"])
})

test("the address read on load restores the view", async () => {
	await open("?q=lunch&sort=old")
	expect($<HTMLInputElement>('input[name="q"]')?.value).toBe("lunch")
	expect($('[data-action="sort"]')?.textContent).toContain("Sort: Oldest first")
	expect(ledgerRows()).toHaveLength(1)
})

test("re-renders in Thai", async () => {
	await open()
	setLocale("th")
	flushSync()
	expect($("h1")?.textContent).toBe("รายการเคลื่อนไหว")
})

test("a custom range chip shows display dates", async () => {
	await open("?from=2026-10-30&to=2026-10-31")
	const chip = $('[data-chip="range"]')
	expect(chip?.textContent).not.toContain("2026-10-30")
	expect(chip?.textContent).toContain("30")
})

test("a failed delete names the delete, not a save, and the row stays open", async () => {
	const { repo } = await open()
	repo.deleteCardPayment = () => Promise.reject(new Error("disk full"))
	await press($('[data-item="payment"]'))
	await press($(`${shown} [data-action="delete"]`))
	await press($(`${shown} [data-action="confirm-delete"]`))
	expect(text($(".error-banner"))).toContain("Could not delete the payment.")
	expect($('[data-item="payment"]')?.getAttribute("aria-expanded")).toBe("true")
})

test("a failed mark paid names the marking, not a save, and the row stays open", async () => {
	const { repo } = await open()
	repo.saveCardPayment = () => Promise.reject(new Error("disk full"))
	await press($('[data-item="planned"]'))
	await press($('[data-action="mark-paid"]'))
	expect(text($(".error-banner"))).toContain("Could not mark the payment paid.")
	expect($('[data-item="planned"]')?.getAttribute("aria-expanded")).toBe("true")
	expect($(`${shown} [data-action="mark-paid"]`)).not.toBeNull()
})

test("the Filter button counts the filters in use and the sort chip opens the sheet", async () => {
	await open("?type=payment&card=A")
	expect($('[data-action="filter"] .tx-count')?.textContent).toBe("2")
	const cardChip = $('[data-chip="card:A"]')
	expect(cardChip?.querySelector(".cl-full")?.textContent).toBe("A) A card (1234)")
	expect(cardChip?.querySelector(".cl-short")?.textContent).toBe("A) A card")
	expect(cardChip?.getAttribute("aria-label")).toContain("A) A card (1234)")
	if (mounted) unmount(mounted)
	mounted = undefined
	await open()
	expect($('[data-action="filter"] .tx-count')).toBeNull()
	expect($('[data-action="sort"]')?.textContent).toContain("Sort: Newest first")
	await press($('[data-action="sort"]'))
	expect($("dialog")).not.toBeNull()
})

test("the summary names the month and signs its figures", async () => {
	await open()
	const summary = $('[data-testid="summary"]')
	expect(summary?.querySelector("h2")?.textContent).toBe("October so far")
	expect(summary?.querySelector(".tx-summary__head small")).toBeNull()
	expect(text(summary)).not.toContain(" · ")
	expect(summary?.querySelector('[data-field="purchases"] b')?.textContent).toBe("−฿1,250.00")
	expect(summary?.querySelector('[data-field="purchases"] b')?.getAttribute("data-tone")).toBe("out")
	expect(summary?.querySelector('[data-field="payments"] b')?.textContent).toBe("+฿300.00")
})

test("the Owed view keeps the title and switch above the owed panel", async () => {
	await open("?view=owed")
	expect($("h1")?.textContent).toBe("Transactions")
	expect($(".tx-grid")?.getAttribute("data-show")).toBe("owed")
	expect($(".tx-owed .tile")).not.toBeNull()
})

/** 117 purchases on top of the three in `seed`: 120 ledger entries, two a day back from October. */
const bulk = async (repo: Repository) => {
	for (let i = 0; i < 117; i++) {
		const day = new Date(Date.UTC(2026, 9, 29) - Math.floor(i / 2) * 86_400_000)
		await repo.savePurchase({
			id: `bulk${i}`,
			cardId: "A",
			date: day.toISOString().slice(0, 10),
			amount: 100_00 + i,
			note: "bulk",
		})
	}
}

const more = () => $('[data-action="show-more"]')

test("the ledger shows 50 rows, then 50 more a click, until all 120 show", async () => {
	await open("", bulk)
	expect(ledgerRows()).toHaveLength(50)
	expect(text(more())).toBe("Show 50 more · 70 left")
	expect(more()?.getAttribute("data-variant")).toBe("quiet")
	await press(more())
	expect(ledgerRows()).toHaveLength(100)
	expect(text(more())).toBe("Show 20 more")
	await press(more())
	expect(ledgerRows()).toHaveLength(120)
	expect(more()).toBeNull()
})

test("each day heading shows once, also where the cut falls inside a day", async () => {
	await open("", bulk)
	const unique = (all: string[]) => new Set(all).size === all.length
	expect(unique(dayHeadings())).toBe(true)
	const before = dayHeadings().length
	await press(more())
	expect(unique(dayHeadings())).toBe(true)
	expect(dayHeadings().length).toBeGreaterThan(before)
})

test("a search, filter or sort change starts the ledger at 50 again; the address keeps no count", async () => {
	const { written } = await open("", bulk)
	await press(more())
	expect(ledgerRows()).toHaveLength(100)
	await type("bulk")
	expect(ledgerRows()).toHaveLength(50)
	expect(text(more())).toBe("Show 50 more · 67 left")
	expect(written.at(-1)).toBe("?q=bulk")
	await press(more())
	expect(ledgerRows()).toHaveLength(100)
	await press($(".tx-fbtn"))
	await press($('dialog [data-sort="big"]'))
	await press($('dialog [data-action="apply"]'))
	await exit()
	expect(ledgerRows()).toHaveLength(50)
	expect(written.every((w) => !w.includes("50"))).toBe(true)
})

test("the results line counts every match, not only the rows shown", async () => {
	await open("?q=bulk", bulk)
	expect(ledgerRows()).toHaveLength(50)
	expect(text($(".result-head"))).toContain("117")
})
