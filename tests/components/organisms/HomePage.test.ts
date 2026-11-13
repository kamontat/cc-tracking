import type { Card } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import HomePage from "#components/organisms/HomePage.svelte"
import { setLocale } from "#lib/i18n/index"
import { LocalStorageRepository } from "#lib/storage/local"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { fakeHistory } from "../../lib/ui/fake-history"
import { saveLocations } from "./list-support"

/**
 * Home's _Needs you_ tab (`/`, RD-22): every row that needs the reader, the plans' writes, and the
 * panels it opens over Home: a list's (`?list=`) and a card's (`?card=`), _Pay_ opening the card's
 * panel straight on its pay form.
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

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)
const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const card = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: id,
	last4: "0000",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
})

/** 10:00 Bangkok on 31 Oct 2026, movable. */
const movableClock = () => {
	let at = new Date("2026-10-31T03:00:00Z")
	return {
		clock: () => at,
		set: (iso: string) => {
			at = new Date(iso)
		},
	}
}

const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 })
	await repo.saveCard(card("A"))
	await repo.saveCard(card("B"))
	await saveLocations(repo, ["krabi"])
}

const setup = async (
	repo: Repository = new InMemoryRepository(),
	{ seeded = false, tickMs, search = "" }: { seeded?: boolean; tickMs?: number; search?: string } = {},
) => {
	setLocale("en")
	if (!seeded) await seed(repo)
	const time = movableClock()
	const history = fakeHistory(`/${search}`)
	mounted = mount(HomePage, {
		target: document.body,
		props: {
			open: async () => ({ ok: true, repo }),
			clock: time.clock,
			address: history.bar,
			newId: () => "id-1",
			...(tickMs ? { tickMs } : {}),
		},
	})
	await settle()
	return { repo, time, history }
}

/** The *Needs you* rows, by row id. */
const needsRows = () =>
	[...document.querySelectorAll("#needs-list [data-row]")].map((el) => el.getAttribute("data-row"))

test("the batch start is never touched", async () => {
	localStorage.clear()
	await setup(new LocalStorageRepository(localStorage))
	expect(localStorage.getItem("cc:batch-start")).toBeNull()
})

test("a paid bill no longer needs you; a sent list does", async () => {
	const repo = new InMemoryRepository()
	await repo.savePurchase({ id: "p1", cardId: "A", date: "2026-09-10", amount: 20_000_00, note: "" })
	await repo.saveCardPayment({
		id: "c1",
		cardId: "A",
		date: "2026-10-01",
		amount: 20_000_00,
		status: "paid",
		period: "2026-09",
	})
	await repo.savePurchase({ id: "p2", cardId: "A", date: "2026-10-28", amount: 5_000_00, note: "" })
	await repo.savePurchaseList({
		id: "l1",
		date: "2026-10-31",
		status: "sent",
		lines: [{ cardId: "B", amount: 10_000_00 }],
	})
	await setup(repo)
	expect($('#needs-list [data-item="waiting"]')).not.toBeNull()
	expect($('#needs-list [data-item="overdue"]')).toBeNull()
})

test("a planned payment due soon needs you, a far one does not", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCardPayment({ id: "c1", cardId: "A", date: "2026-11-02", amount: 1_000_00, status: "planned" })
	await repo.saveCardPayment({ id: "c2", cardId: "A", date: "2026-12-25", amount: 1_000_00, status: "planned" })
	await setup(repo)
	expect(needsRows()).toEqual(["plan:A:c1"])
})

test("an overdue bill needs you", async () => {
	const repo = new InMemoryRepository()
	await repo.savePurchase({ id: "p1", cardId: "A", date: "2026-09-10", amount: 3_000_00, note: "" })
	await setup(repo)
	expect(needsRows()).toContain("due:A")
})

test("past midnight moves today", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCardPayment({ id: "c1", cardId: "A", date: "2026-11-01", amount: 1_000_00, status: "planned" })
	const { time } = await setup(repo, { tickMs: 5 })
	const when = () => flat($('[data-row="plan:A:c1"] .a-sub'))
	expect(when()).toContain("tomorrow")
	time.set("2026-11-01T03:00:00Z")
	await new Promise((resolve) => setTimeout(resolve, 30))
	await settle()
	expect(when()).toContain("today")
})

class FailingReadRepository extends InMemoryRepository {
	override listCards(): Promise<Card[]> {
		return Promise.reject(new Error("disk is gone"))
	}
}

test("a failed read shows the banner", async () => {
	await setup(new FailingReadRepository(), { seeded: true })
	expect(flat($(".error-banner p")).startsWith("Could not read your cards.")).toBe(true)
})

/** Opens the Needs you row `row` (unless open) and taps `action` in it. */
const tapIn = async (row: string, action: string) => {
	const head = $(`[data-row="${row}"] .a-hit`)
	if (head?.getAttribute("aria-expanded") !== "true") head?.click()
	await settle()
	$(`[data-row="${row}"] [data-action="${action}"]`)?.click()
	await settle()
}

/** Opens row `row`, focuses its `action` as a keyboard would, and presses it. */
const pressIn = async (row: string, action: string) => {
	$(`[data-row="${row}"] .a-hit`)?.click()
	await settle()
	const button = $(`[data-row="${row}"] [data-action="${action}"]`)
	button?.focus()
	expect(document.activeElement).toBe(button)
	button?.click()
	await settle()
}

const soonPlan = { id: "c1", cardId: "A", date: "2026-11-02", amount: 1_000_00, status: "planned" as const }
const plans = (...dates: string[]) => dates.map((date, i) => ({ ...soonPlan, id: `c${i + 1}`, date }))

test("Paid on a Needs you plan stores it paid and the row goes", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCardPayment(soonPlan)
	await setup(repo)
	await tapIn("plan:A:c1", "mark-paid")
	expect((await repo.listCardPayments("A"))[0]?.status).toBe("paid")
	expect($('[data-row="plan:A:c1"]')).toBeNull()
	expect($(".error-banner")).toBeNull()
})

test("after Paid takes a row away, focus moves to the next row's head", async () => {
	const repo = new InMemoryRepository()
	for (const plan of plans("2026-11-01", "2026-11-02", "2026-11-03")) await repo.saveCardPayment(plan)
	await setup(repo)
	await pressIn("plan:A:c2", "mark-paid")
	expect($('[data-row="plan:A:c2"]')).toBeNull()
	expect(document.activeElement).toBe($('[data-row="plan:A:c3"] .a-hit'))
})

test("after Paid takes the last row away, focus moves to the row before it", async () => {
	const repo = new InMemoryRepository()
	for (const plan of plans("2026-11-01", "2026-11-02")) await repo.saveCardPayment(plan)
	await setup(repo)
	await pressIn("plan:A:c2", "mark-paid")
	expect(document.activeElement).toBe($('[data-row="plan:A:c1"] .a-hit'))
})

test("after Paid takes the only row away, focus moves to the heading", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCardPayment(soonPlan)
	await setup(repo)
	await pressIn("plan:A:c1", "mark-paid")
	const heading = $(".needs h2")
	expect(heading?.getAttribute("tabindex")).toBe("-1")
	expect(document.activeElement).toBe(heading)
})

test("after a two-step Delete takes a row away, focus moves to the next row's head", async () => {
	const repo = new InMemoryRepository()
	for (const plan of plans("2026-11-01", "2026-11-02")) await repo.saveCardPayment(plan)
	await setup(repo)
	$('[data-row="plan:A:c1"] .a-hit')?.click()
	await settle()
	const first = $('[data-row="plan:A:c1"] [data-action="delete"]')
	first?.focus()
	first?.click()
	await settle()
	// The swap moved focus to the asking Delete.
	const second = $('[data-row="plan:A:c1"] [data-action="confirm-delete"]')
	expect(document.activeElement).toBe(second)
	second?.click()
	await settle()
	expect($('[data-row="plan:A:c1"]')).toBeNull()
	expect(document.activeElement).toBe($('[data-row="plan:A:c2"] .a-hit'))
})

class FailingWriteRepository extends InMemoryRepository {
	override saveCardPayment(): Promise<void> {
		return Promise.reject(new Error("disk is full"))
	}
}

test("a failed write shows the banner and keeps the row open", async () => {
	const repo = new FailingWriteRepository()
	await InMemoryRepository.prototype.saveCardPayment.call(repo, soonPlan)
	await setup(repo)
	await tapIn("plan:A:c1", "mark-paid")
	expect(flat($(".error-banner p"))).toBe("Could not mark the payment paid. disk is full")
	expect($('[data-row="plan:A:c1"] .a-hit')?.getAttribute("aria-expanded")).toBe("true")
})

const draft = { id: "d1", date: "2026-10-31", status: "draft" as const, lines: [{ cardId: "A", amount: 1_000_00 }] }

/** Taps the first step of a two-step button in a row; returns the second step. */
const tapTwice = async (row: string, first: string, second: string) => {
	$(`[data-row="${row}"] .a-hit`)?.click()
	await settle()
	$(`[data-row="${row}"] [data-action="${first}"]`)?.click()
	await settle()
	return async () => {
		$(`[data-row="${row}"] [data-action="${second}"]`)?.click()
		await settle()
	}
}

test("Delete on a planned payment is two steps, then the stored payment is gone", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCardPayment(soonPlan)
	await setup(repo)
	const second = await tapTwice("plan:A:c1", "delete", "confirm-delete")
	expect(await repo.listCardPayments("A")).toHaveLength(1)
	await second()
	expect(await repo.listCardPayments("A")).toEqual([])
	expect($('[data-row="plan:A:c1"]')).toBeNull()
	expect($(".error-banner")).toBeNull()
})

test("Needs you is the page: every row, with no Ready to use beside it and no See more", async () => {
	const repo = new InMemoryRepository()
	for (const plan of plans("2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"))
		await repo.saveCardPayment(plan)
	await setup(repo)
	expect(needsRows()).toHaveLength(6)
	expect($('[data-action="more"]')).toBeNull()
	expect($(".home-grid, .ready, #ready-list")).toBeNull()
	expect($(".panel-layout > .needs-main > .needs")).not.toBeNull()
})

test("a list's row opens its panel over Home, pushing ?list=; Back closes it", async () => {
	const repo = new InMemoryRepository()
	await repo.savePurchaseList(draft)
	const { history } = await setup(repo)
	$('[data-row="list:d1"] .a-hit')?.click()
	await settle()
	expect(history.now()).toBe("/?list=d1")
	expect($(".panel-layout")?.hasAttribute("data-panel")).toBe(true)
	expect($('[data-row="list:d1"] .a-hit')?.getAttribute("aria-current")).toBe("true")
	expect($('.detail-panel [data-action="continue"]')?.getAttribute("href")).toBe("/transactions/lists/edit?list=d1")
	history.userBack()
	await settle()
	expect(history.now()).toBe("/")
	expect($(".detail-panel")).toBeNull()
})

test("deleting a draft in its panel takes its row off Needs you", async () => {
	const repo = new InMemoryRepository()
	await repo.savePurchaseList(draft)
	await setup(repo, { search: "?list=d1" })
	$('.detail-panel [data-action="delete-draft"]')?.click()
	await settle()
	expect(await repo.listPurchaseLists()).toEqual([])
	expect($('[data-row="list:d1"]')).toBeNull()
	expect($(".detail-panel")).toBeNull()
})

/** A card with a lower-case id, as a card's panel needs (RD-28), with a bill overdue since October. */
const overdueSeven = async (repo: Repository) => {
	await repo.saveCard(card("7", { name: "KTC" }))
	await repo.savePurchase({ id: "p1", cardId: "7", date: "2026-09-10", amount: 3_000_00, note: "" })
}

test("Open card on an overdue bill opens the card's panel over Home; card wins over list", async () => {
	const repo = new InMemoryRepository()
	await overdueSeven(repo)
	const { history } = await setup(repo)
	await tapIn("due:7", "open-card")
	expect(history.now()).toBe("/?card=7")
	expect($(".detail-panel .card-hero")).not.toBeNull()
	if (mounted) unmount(mounted)
	mounted = undefined
	await repo.savePurchaseList(draft)
	await setup(repo, { seeded: true, search: "?list=d1&card=7" })
	expect($(".detail-panel .card-hero")).not.toBeNull()
	expect($('.detail-panel [data-action="continue"]')).toBeNull()
})

test("Pay on an overdue bill opens the card's panel on its pay form, the amount left filled in; Cancel swaps the card back in place", async () => {
	const repo = new InMemoryRepository()
	await overdueSeven(repo)
	const { history } = await setup(repo)
	await tapIn("due:7", "pay")
	expect(history.now()).toBe("/?card=7")
	expect(history.size()).toBe(2)
	expect($<HTMLInputElement>('.detail-panel input[name="amount"]')?.value).toBe("3000")
	$('.detail-panel [data-action="cancel"]')?.click()
	await settle()
	expect($(".detail-panel .card-hero")).not.toBeNull()
	expect(history.now()).toBe("/?card=7")
	expect(history.size()).toBe(2)
})

test("saving the payment returns to the card in place, and the bill leaves Needs you", async () => {
	const repo = new InMemoryRepository()
	await overdueSeven(repo)
	await setup(repo)
	await tapIn("due:7", "pay")
	$(".detail-panel form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
	expect(await repo.listCardPayments("7")).toMatchObject([{ id: "id-1", amount: 3_000_00, status: "paid" }])
	expect($(".detail-panel .card-hero")).not.toBeNull()
	expect($('[data-row="due:7"]')).toBeNull()
})

test("Home's two-column grid is gone from app.css: each tab has the screen to itself", async () => {
	const css = await Bun.file("src/styles/app.css").text()
	expect(css).not.toMatch(/\.home-(grid|needs|ready)\b/)
})
