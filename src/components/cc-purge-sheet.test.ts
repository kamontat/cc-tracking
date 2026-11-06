import { afterEach, beforeEach, expect, test } from "vitest"
import "#components/cc-purge-sheet"
import type { CcPurgeSheet, PurgedDetail } from "#components/cc-purge-sheet"
import type { Card } from "#lib/domain/types"

import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

beforeEach(() => globalThis.localStorage.clear())
afterEach(() => setLocale("en"))

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	comment: "",
	archived: false,
}

/**
 * Today is 2026-11-02, so 1y keeps from 2025-11-02. Purchases a and b (2025-01) sit on a
 * statement the payment settles; c (2025-03) is older but its statement is unpaid, so it stays;
 * d (2026-07) is inside 1y and 6m.
 */
const populated = async (): Promise<InMemoryRepository> => {
	const repo = new InMemoryRepository()
	for (const record of defaultLocations(DEFAULT_SETTINGS)) await repo.saveLocation(record)
	await repo.saveCard(card)
	for (const [id, date] of [
		["a", "2025-01-05"],
		["b", "2025-01-06"],
	] as const)
		await repo.savePurchase({
			id,
			cardId: "kbank",
			date,
			amount: 100,
			note: "",
		})
	// Statement of 2025-03 is never paid, so it stays.
	await repo.savePurchase({
		id: "c",
		cardId: "kbank",
		date: "2025-03-05",
		amount: 50,
		note: "",
	})
	await repo.saveCardPayment({
		id: "pay1",
		cardId: "kbank",
		date: "2025-02-10",
		amount: 200,
		status: "paid",
	})
	await repo.savePurchase({
		id: "d",
		cardId: "kbank",
		date: "2026-07-05",
		amount: 10,
		note: "",
	})
	return repo
}

const mount = async (repo: Repository) => {
	document.body.innerHTML = ""
	const element = document.createElement("cc-purge-sheet") as CcPurgeSheet
	element.repo = repo
	element.today = "2026-11-02"
	const purged: PurgedDetail[] = []
	let closed = 0
	element.addEventListener("purged", (event) => purged.push((event as CustomEvent<PurgedDetail>).detail))
	element.addEventListener("close", () => {
		closed += 1
	})
	document.body.append(element)
	await settle()
	await element.updateComplete
	const root = element.shadowRoot as ShadowRoot
	const find = (selector: string) => root.querySelector<HTMLElement>(selector)
	return {
		element,
		root,
		purged,
		closed: () => closed,
		find,
		text: () => root.textContent?.replace(/\s+/g, " ") ?? "",
		click: async (selector: string) => {
			const button = find(selector)
			if (!button) throw new Error(`no ${selector}`)
			button.click()
			await settle()
			await element.updateComplete
		},
	}
}

test("opens on 1 year pressed and counts what would go", async () => {
	const { find, text } = await mount(await populated())
	expect(find('[data-age="1y"]')?.getAttribute("aria-pressed")).toBe("true")
	expect(find('[data-age="6m"]')?.getAttribute("aria-pressed")).toBe("false")
	expect(find("cc-modal")?.hasAttribute("sheet")).toBe(true)
	expect(text()).toContain("2 purchases bought before 02 Nov 2025 will be deleted.")
})

test("says how many older purchases stay on unpaid statements", async () => {
	const { text } = await mount(await populated())
	expect(text()).toContain("1 older purchase stays: its statement isn't fully paid.")
})

test("choosing 6 months recounts", async () => {
	const { click, text } = await mount(await populated())
	await click('[data-age="6m"]')
	expect(text()).toContain("before 02 May 2026")
	expect(text()).toContain("2 purchases")
})

test("with nothing to delete the danger button is disabled and says so", async () => {
	const { click, find, text } = await mount(await populated())
	await click('[data-age="3y"]')
	expect(text()).toContain("Nothing is older than 3 years.")
	const button = find('[data-action="ask"]') as HTMLButtonElement
	expect(button.disabled).toBe(true)
	expect(button.textContent).toContain("Nothing to delete")
	expect(button.getAttribute("data-variant")).toBe("danger")
})

test("Delete N purchases swaps to a second ask, and Keep them swaps back", async () => {
	const { click, find, text } = await mount(await populated())
	expect(find('[data-action="ask"]')?.textContent).toContain("Delete 2 purchases…")
	await click('[data-action="ask"]')
	expect(text()).toContain("This can't be undone.")
	expect(find('[data-action="yes"]')?.textContent).toContain("Yes, delete 2")
	expect(find('[data-action="ask"]')).toBeNull()
	await click('[data-action="keep"]')
	expect(find('[data-action="ask"]')).not.toBeNull()
	expect(find('[data-action="yes"]')).toBeNull()
})

test("Yes applies the plan and emits purged, staying busy until the sheet is gone", async () => {
	const repo = await populated()
	const { click, find, purged } = await mount(repo)
	await click('[data-action="ask"]')
	await click('[data-action="yes"]')
	await new Promise((resolve) => setTimeout(resolve, 400))
	expect(purged).toEqual([{ count: 2, age: "1y" }])
	expect((await repo.listPurchases("kbank")).map((p) => p.id).sort()).toEqual(["c", "d"])
	// No second apply during the exit animation.
	expect((find('[data-action="yes"]') as HTMLButtonElement | null)?.disabled).toBe(true)
})

test("switching language on the second ask keeps it", async () => {
	const { click, find, element } = await mount(await populated())
	await click('[data-action="ask"]')
	setLocale("th")
	await element.updateComplete
	expect(find('[data-action="yes"]')).not.toBeNull()
	expect(find('[data-action="yes"]')?.textContent).toContain("ใช่")
})

test("choosing another age while asking goes back to the first button", async () => {
	const { click, find } = await mount(await populated())
	await click('[data-action="ask"]')
	await click('[data-age="6m"]')
	expect(find('[data-action="ask"]')).not.toBeNull()
})

test("while the first count is under way the button waits, rather than saying nothing is there", async () => {
	const repo = await populated()
	let release = () => {}
	const listCards = repo.listCards.bind(repo)
	const gate = new Promise<void>((resolve) => {
		release = resolve
	})
	repo.listCards = async () => {
		await gate
		return listCards()
	}
	const { find, text, element } = await mount(repo)
	const button = find('[data-action="ask"]') as HTMLButtonElement
	expect(button.disabled).toBe(true)
	expect(button.textContent).toContain("Counting…")
	expect(text()).not.toContain("Nothing")

	release()
	await settle()
	await element.updateComplete
	expect(find('[data-action="ask"]')?.textContent).toContain("Delete 2 purchases…")
})

test("a failed apply shows why, stops waiting and counts again before a retry", async () => {
	setLocale("en")
	const repo = await populated()
	const { click, find, purged, element } = await mount(repo)
	let counts = 0
	const listStatementDates = repo.listStatementDates.bind(repo)
	repo.listStatementDates = (cardId: string) => {
		counts += 1
		return listStatementDates(cardId)
	}
	repo.deletePurchase = () => Promise.reject(new Error("storage full"))
	await click('[data-action="ask"]')
	await click('[data-action="yes"]')
	await settle()
	await element.updateComplete

	expect(find('[role="alert"]')?.textContent).toContain("storage full")
	expect(purged).toEqual([])
	// Counted again: the second ask is gone and the first button offers what is there now.
	expect(counts).toBeGreaterThan(0)
	const ask = find('[data-action="ask"]') as HTMLButtonElement
	expect(ask.disabled).toBe(false)
	expect(ask.textContent).toContain("Delete 2 purchases…")
})
