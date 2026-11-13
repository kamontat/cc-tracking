import type { Card } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import HomePage from "#components/organisms/HomePage.svelte"
import { setLocale } from "#lib/i18n/index"
import { LocalStorageRepository } from "#lib/storage/local"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { saveLocations } from "./list-support"

/**
 * Home's island: *Needs you* and a short *Ready to use* (DD-103, DD-152). Ported from the legacy
 * route's tests; where those read the two elements' properties, these read what they draw and
 * press the real rows.
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
	{ seeded = false, tickMs }: { seeded?: boolean; tickMs?: number } = {},
) => {
	setLocale("en")
	if (!seeded) await seed(repo)
	const time = movableClock()
	mounted = mount(HomePage, {
		target: document.body,
		props: { open: async () => ({ ok: true, repo }), clock: time.clock, ...(tickMs ? { tickMs } : {}) },
	})
	await settle()
	return { repo, time }
}

/** The *Ready to use* tiles, in order. */
const readyCards = () =>
	[...document.querySelectorAll("#ready-list [data-card]")].map((el) => el.getAttribute("data-card"))
/** The *Needs you* rows, by row id. */
const needsRows = () =>
	[...document.querySelectorAll("#needs-list [data-row]")].map((el) => el.getAttribute("data-row"))

test("needs you comes before ready to use", async () => {
	await setup()
	const grid = $(".home-grid")
	expect([...(grid?.children ?? [])].map((c) => c.className.split(" ")[0])).toEqual(["home-needs", "home-ready"])
	expect(grid?.querySelector(".home-needs h1")).not.toBeNull()
	expect(grid?.querySelector(".home-ready h2")).not.toBeNull()
})

test("a card in no stored group is left out of Ready to use, and nothing counts it (RD-27)", async () => {
	const repo = new InMemoryRepository()
	await seed(repo)
	const { limitGroupId: _, ...loose } = card("N")
	await repo.saveCard(loose)
	await repo.saveCard(card("O", { limitGroupId: "gone" }))
	await setup(repo, { seeded: true })
	expect(readyCards()).toEqual(["A", "B"])
	expect(document.body.textContent).not.toContain("no limit group")
	expect($('a[href^="/cards?ungrouped"]')).toBeNull()
})

test("the batch start is never touched", async () => {
	localStorage.clear()
	await setup(new LocalStorageRepository(localStorage))
	expect(localStorage.getItem("cc:batch-start")).toBeNull()
})

test("Home has no selection: the short panel has no Start a list", async () => {
	await setup()
	expect(readyCards()).toEqual(["A", "B"])
	expect($(".home-ready .tick")).toBeNull()
	expect($('[data-action="start"]')).toBeNull()
	expect($('[data-testid="selection"]')).toBeNull()
	expect(document.documentElement.hasAttribute("data-selecting")).toBe(false)
})

test("the floating Payment button stays on Home", async () => {
	const css = await Bun.file("src/styles/app.css").text()
	expect(css).not.toContain("data-selecting")
})

test("stored payments and sent lists move the room", async () => {
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
	expect(readyCards()).toHaveLength(2)
	// G1's ฿100,000.00, less A's open ฿5,000.00 and the waiting ฿10,000.00, on both cards.
	for (const id of ["A", "B"]) expect(flat($(`#ready-list [data-card="${id}"]`))).toContain("฿85,000.00")
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

test("ready to use names the places that take purchases, A to Z in the reader's language", async () => {
	const repo = new InMemoryRepository()
	await seed(repo)
	await repo.saveLocation({ id: "chiang-mai", name: "Chiang Mai", takesPurchases: true })
	await repo.saveCard(card("C", { location: "chiang-mai" }))
	await setup(repo, { seeded: true })
	expect(flat($(".home-ready .head small"))).toBe("3 cards in Chiang Mai, Krabi")
	expect(readyCards().sort()).toEqual(["A", "B", "C"])
	// A language switch repaints with the names, and their order, in that language.
	setLocale("th")
	await settle()
	expect(flat($(".home-ready .head small"))).toContain("กระบี่, Chiang Mai")
})

test("with nothing ready, the panel still names no place that takes none", async () => {
	const repo = new InMemoryRepository()
	await seed(repo)
	await saveLocations(repo, [])
	await setup(repo, { seeded: true })
	expect(readyCards()).toEqual([])
	expect($('.home-ready [data-action="settings"]')).not.toBeNull()
	expect(flat($(".home-ready .head small"))).toBe("0 cards in")
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

test("Home is two columns from 900px: Ready to use left, Needs you right; a phone keeps Needs you first", async () => {
	const css = await Bun.file("src/styles/app.css").text()
	expect(css).toMatch(
		/@media \(min-width: 900px\)\s*\{\s*\.home-grid\s*\{[^}]*grid-template-columns: minmax\(0, 1\.5fr\) minmax\(0, 1fr\);[^}]*grid-template-areas: "ready needs";/,
	)
	expect(css).toMatch(/\.home-grid > \.home-needs\s*\{\s*grid-area: needs;/)
	expect(css).toMatch(/\.home-grid > \.home-ready\s*\{\s*grid-area: ready;/)
	expect(css).not.toMatch(/\.home-grid > cc-/)
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

test("in a folded list, focus moves to the row that slides into the gone row's place", async () => {
	const repo = new InMemoryRepository()
	for (const plan of plans("2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"))
		await repo.saveCardPayment(plan)
	await setup(repo)
	// Five show; the sixth waits behind See more.
	expect($('[data-row="plan:A:c6"]')).toBeNull()
	await pressIn("plan:A:c5", "mark-paid")
	expect(document.activeElement).toBe($('[data-row="plan:A:c6"] .a-hit'))
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
	const heading = $(".home-needs h1")
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

test("Delete on a Needs you draft removes it at once", async () => {
	const repo = new InMemoryRepository()
	await repo.savePurchaseList(draft)
	await setup(repo)
	await tapIn("list:d1", "delete-draft")
	expect(await repo.listPurchaseLists()).toEqual([])
	expect($('[data-row="list:d1"]')).toBeNull()
})

test("Merge on a Needs you draft takes in the other draft for that day", async () => {
	const repo = new InMemoryRepository()
	await repo.savePurchaseList(draft)
	await repo.savePurchaseList({ ...draft, id: "d2", lines: [{ cardId: "A", amount: 0 }] })
	await setup(repo)
	await tapIn("list:d1", "merge")
	expect(await repo.listPurchaseLists()).toEqual([draft])
	expect($('[data-row="list:d2"]')).toBeNull()
})

test("Delete refuses a draft sent since, and says why", async () => {
	const repo = new InMemoryRepository()
	await repo.savePurchaseList(draft)
	await setup(repo)
	await repo.savePurchaseList({ ...draft, status: "sent" })
	await tapIn("list:d1", "delete-draft")
	expect((await repo.listPurchaseLists()).map((l) => l.status)).toEqual(["sent"])
	expect(flat($(".error-banner p"))).toBe(
		"Could not delete the draft. This list was sent or saved elsewhere, so it was not changed.",
	)
})

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

test("Confirm on a waiting list is two steps, then Save stores the list saved", async () => {
	const repo = new InMemoryRepository()
	await repo.savePurchaseList({ ...draft, id: "w1", status: "sent" })
	await setup(repo)
	const second = await tapTwice("list:w1", "confirm-list", "save-list")
	expect((await repo.listPurchaseLists()).map((l) => l.status)).toEqual(["sent"])
	await second()
	expect((await repo.listPurchaseLists()).map((l) => l.status)).toEqual(["saved"])
	expect($('[data-row="list:w1"]')).toBeNull()
})
