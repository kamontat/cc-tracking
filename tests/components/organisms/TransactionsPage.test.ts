import type { Card, PurchaseList } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import TransactionsPage from "#components/organisms/TransactionsPage.svelte"
import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { fakeHistory } from "../../lib/ui/fake-history"

/**
 * The Ledger tab's island (`/transactions`, RD-22): the ledger with its search, filters, sort and
 * grouping in the address (`q`, `f.*`, `sort`, `dir`, `by`), and a purchase's _Open card_
 * opening the card's panel over it (`?card=`). The Lists tab and what is owed are not here.
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

const open = async (search = "", extra: (repo: Repository) => Promise<void> = async () => {}) => {
	setLocale("en")
	const repo = new InMemoryRepository()
	await seed(repo)
	await extra(repo)
	const history = fakeHistory(`/transactions${search}`)
	// Every query the page wrote in place, as `written` was: what follows `/transactions`.
	const written = new Proxy([] as string[], {
		get: (_, key) => {
			const list = history.calls
				.filter((call) => call.startsWith("replace "))
				.map((call) => call.slice("replace /transactions".length))
			return Reflect.get(list, key)
		},
	})
	mounted = mount(TransactionsPage, {
		target: document.body,
		props: { open: async () => ({ ok: true, repo }), clock: CLOCK, address: history.bar },
	})
	await settle()
	return { repo, written, history }
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
const ledgerRows = () => $$('.tx-main :is([data-item="purchase"], [data-item="payment"])')
const dayHeadings = () => $$("section.day h3").map((h) => text(h))

test("the default view shows the summary, upcoming and the ledger by day", async () => {
	const { written } = await open()
	// The title and the tabs are the page's, static (PageTabs); the island has no switch.
	expect($("h1")).toBeNull()
	expect($("fieldset.tx-switch, [data-view]")).toBeNull()
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
	const { written } = await open("?f.types=payment&f.cards=A")
	expect(ledgerRows()).toHaveLength(1)
	await press($('[data-chip="type:payment"]'))
	expect(written.at(-1)).toBe("?f.cards=A")
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
	expect(written.at(-1)).toBe("?f.types=payment")
	expect($("dialog")).toBeNull()
	expect(ledgerRows()).toHaveLength(1)
})

test("the sheet sorts by amount, smallest first, kept in the address", async () => {
	const { written } = await open()
	await press($('[data-action="sort"]'))
	await press($('dialog [data-sort="amount"]'))
	await press($('dialog [data-dir="asc"]'))
	await press($('dialog [data-action="apply"]'))
	await exit()
	expect(written.at(-1)).toBe("?sort=amount&dir=asc")
	expect($('[data-action="sort"]')?.textContent).toContain("Sort: Smallest first")
})

test("the sort and group chips open the sheet on their own tabs", async () => {
	await open()
	await press($('[data-action="sort"]'))
	expect($<HTMLElement>('dialog [role=tabpanel][data-tab="sort"]')?.hidden).toBe(false)
	await press($('dialog [data-action="close"]'))
	await exit()
	await press($('[data-action="group"]'))
	expect($<HTMLElement>('dialog [role=tabpanel][data-tab="group"]')?.hidden).toBe(false)
	await press($('dialog [data-action="close"]'))
	await exit()
	await press($('[data-action="filter"]'))
	expect($<HTMLElement>('dialog [role=tabpanel][data-tab="filter"]')?.hidden).toBe(false)
})

test("the ledger groups by card from the sheet, kept in the address as by", async () => {
	const { written } = await open()
	expect($('[data-action="group"]')?.textContent).toContain("Group: Day")
	await press($('[data-action="group"]'))
	await press($('dialog [data-by="card"]'))
	await press($('dialog [data-action="apply"]'))
	await exit()
	expect(written.at(-1)).toBe("?by=card")
	expect($(".ledger section.day")).toBeNull()
	expect($(".ledger section.card")).not.toBeNull()
})

test("what is owed is not on Transactions any more: no owed column, no Lists view", async () => {
	await open("?view=owed")
	expect($(".tx-owed, .tx-grid, .tile")).toBeNull()
	expect($('[data-row^="list:"]:not([data-row="list:w1"])')).toBeNull()
	expect(ledgerRows()).toHaveLength(3)
})

test("a purchase's Open card opens the card's panel over the ledger, and Back closes it", async () => {
	const { history } = await open("?f.types=purchase", async (r) => {
		await r.saveCard(card("7"))
		await r.savePurchase({ id: "p7", cardId: "7", date: "2026-10-31", amount: 70_00, note: "seven" })
	})
	await press($('[data-row="buy:7:p7"] .a-hit'))
	await press($(`${shown} [data-action="open-card"]`))
	expect(history.now()).toBe("/transactions?f.types=purchase&card=7")
	expect($(".detail-panel")).not.toBeNull()
	expect($(".panel-layout")?.hasAttribute("data-panel")).toBe(true)
	history.userBack()
	await settle()
	expect(history.now()).toBe("/transactions?f.types=purchase")
	expect($(".detail-panel")).toBeNull()
})

test("a pasted ?card= opens the panel at once, and a filter change keeps it", async () => {
	const { history } = await open("?card=7", async (r) => {
		await r.saveCard(card("7"))
	})
	expect($(".detail-panel")).not.toBeNull()
	await type("fuel")
	expect(history.now()).toBe("/transactions?q=fuel&card=7")
	expect($(".detail-panel")).not.toBeNull()
})

test("Back and Forward between the page's own entries read the ledger's settings again", async () => {
	const { history } = await open("", async (r) => {
		await r.saveCard(card("7"))
		await r.savePurchase({ id: "p7", cardId: "7", date: "2026-10-31", amount: 70_00, note: "seven" })
	})
	await press($('[data-row="buy:7:p7"] .a-hit'))
	await press($(`${shown} [data-action="open-card"]`))
	await type("seven")
	expect(history.now()).toBe("/transactions?q=seven&card=7")
	history.userBack()
	await settle()
	// The entry under the panel still holds the address before the search.
	expect($<HTMLInputElement>('input[name="q"]')?.value).toBe("")
})

test("Mark paid moves a plan into the ledger", async () => {
	const { repo } = await open()
	await press($('[data-item="planned"]'))
	await press($('[data-action="mark-paid"]'))
	const planned = (await repo.listCardPayments("A")).find((p) => p.id === "c2")
	expect(planned).toMatchObject({ id: "c2", status: "paid", date: "2026-10-31" })
	expect($('[data-item="planned"]')).toBeNull()
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
	await open("?q=lunch&dir=asc")
	expect($<HTMLInputElement>('input[name="q"]')?.value).toBe("lunch")
	expect($('[data-action="sort"]')?.textContent).toContain("Sort: Oldest first")
	expect(ledgerRows()).toHaveLength(1)
})

test("re-renders in Thai", async () => {
	await open()
	setLocale("th")
	flushSync()
	expect($('input[name="q"]')?.getAttribute("placeholder")).toBe("ค้นหาบัตร บันทึก หรือจำนวนเงิน")
})

test("a custom range chip shows display dates", async () => {
	await open("?f.from=2026-10-30&f.to=2026-10-31")
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
	await open("?f.types=payment&f.cards=A")
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
	await press($('dialog [data-sort="amount"]'))
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
