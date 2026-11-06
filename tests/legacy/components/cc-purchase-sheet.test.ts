import { afterEach, expect, test } from "vitest"
import "#legacy/components/cc-purchase-sheet"
import type { CcPurchaseSheet } from "#legacy/components/cc-purchase-sheet"
import type { Card, LimitGroup, Purchase } from "#lib/domain/types"

import { setLocale } from "#lib/i18n/index"

afterEach(() => setLocale("en"))

const group: LimitGroup = { id: "g1", name: "KBank", limit: 100_000_00 }
const card: Card = {
	id: "kb",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g1",
}
const purchase: Purchase = {
	id: "p1",
	cardId: "kb",
	date: "2026-10-02",
	amount: 1_234_50,
	note: "fuel",
	addedAt: "2026-10-02T03:00:00.000Z",
}

const mount = async (props: Partial<CcPurchaseSheet> = {}) => {
	document.body.innerHTML = ""
	const element = document.createElement("cc-purchase-sheet") as CcPurchaseSheet
	Object.assign(element, {
		card,
		groups: [group],
		purchase,
		today: "2026-10-30",
		...props,
	})
	document.body.append(element)
	await element.updateComplete
	return { element, root: element.shadowRoot as ShadowRoot }
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const input = (root: ShadowRoot, name: string) => root.querySelector<HTMLInputElement>(`input[name="${name}"]`)

const type = async (element: CcPurchaseSheet, name: string, value: string) => {
	const field = input(element.shadowRoot as ShadowRoot, name)
	if (!field) throw new Error(`no ${name} field`)
	field.value = value
	field.dispatchEvent(new Event("input"))
	await element.updateComplete
}

const submit = async (element: CcPurchaseSheet) => {
	element.shadowRoot?.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true }))
	await element.updateComplete
}

const saved = (element: CcPurchaseSheet) => {
	const got: Purchase[] = []
	element.addEventListener("save-purchase", (e) => got.push((e as CustomEvent<Purchase>).detail))
	return got
}

test("a sheet headed Edit purchase, the card fixed and named, the fields filled", async () => {
	const { root } = await mount()
	const modal = root.querySelector("cc-modal")
	expect(modal?.hasAttribute("sheet")).toBe(true)
	expect(modal?.getAttribute("heading")).toBe("Edit purchase")
	const named = root.querySelector('[data-field="card"]')
	expect(text(named?.querySelector(".mini"))).toBe("4821")
	expect(text(named?.querySelector(".card-label"))).toBe("kb) KBank Visa")
	expect(named?.querySelector("select, input")).toBeNull()
	expect(input(root, "date")?.value).toBe("2026-10-02")
	expect(input(root, "amount")?.value).toBe("1234.50")
	expect(input(root, "note")?.value).toBe("fuel")
})

test("Save changes hands back the purchase with its id, card and addedAt kept", async () => {
	const { element, root } = await mount()
	const got = saved(element)
	await type(element, "date", "2026-10-03")
	await type(element, "amount", "500")
	await type(element, "note", " tyres ")
	expect(text(root.querySelector('button[type="submit"]'))).toBe("Save changes")
	await submit(element)
	expect(got).toEqual([
		{
			id: "p1",
			cardId: "kb",
			date: "2026-10-03",
			amount: 500_00,
			note: "tyres",
			addedAt: "2026-10-02T03:00:00.000Z",
		},
	])
})

test("a purchase saved before entry times stays without addedAt", async () => {
	const { addedAt: _, ...older } = purchase
	const { element } = await mount({ purchase: older })
	const got = saved(element)
	await submit(element)
	expect(got[0] && "addedAt" in got[0]).toBe(false)
})

test("a bad amount or date says why and sends nothing", async () => {
	const { element, root } = await mount()
	const got = saved(element)
	await type(element, "amount", "abc")
	await submit(element)
	expect(text(root.querySelector('[role="alert"]'))).toBe("Enter the amount in baht, like 1234.56.")
	await type(element, "amount", "10")
	await type(element, "date", "2026-02-31")
	await submit(element)
	expect(text(root.querySelector('[role="alert"]'))).toBe("That date does not exist. Use YYYY-MM-DD.")
	expect(got).toEqual([])
})

test("a date ahead of today or on the close day is warned about, not refused", async () => {
	const { element, root } = await mount()
	await type(element, "date", "2026-11-02")
	expect(root.querySelector('[data-testid="future-date-warning"]')).not.toBe(null)
	await type(element, "date", "2026-10-18")
	expect(root.querySelector('[data-testid="close-date-warning"]')).not.toBe(null)
})

test("a failed save shows why in the sheet and keeps what was typed", async () => {
	const { element, root } = await mount()
	await type(element, "note", "typed")
	element.error = "Could not save. disk is full"
	element.purchase = { ...purchase }
	await element.updateComplete
	expect(root.querySelector("cc-error-banner")?.message).toContain("disk is full")
	expect(input(root, "note")?.value).toBe("typed")
})

test("while busy the save waits and the sheet holds", async () => {
	const { element, root } = await mount({ busy: true })
	const got = saved(element)
	expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
	await submit(element)
	expect(got).toEqual([])
	expect(root.querySelector("cc-modal")?.held).toBe(true)
})

test("closing the modal asks the page to close", async () => {
	const { element, root } = await mount()
	let closed = 0
	element.addEventListener("close", () => closed++)
	root.querySelector("cc-modal")?.dispatchEvent(new CustomEvent("close"))
	expect(closed).toBe(1)
})

const NOW = new Date("2026-10-30T05:00:00.000Z")

test("with no purchase the sheet adds one: headed Add purchase, blank, dated today", async () => {
	const { root } = await mount({ purchase: null })
	expect(root.querySelector("cc-modal")?.getAttribute("heading")).toBe("Add purchase")
	expect(text(root.querySelector('[data-field="card"] .card-label'))).toBe("kb) KBank Visa")
	expect(input(root, "date")?.value).toBe("2026-10-30")
	expect(input(root, "amount")?.value).toBe("")
	expect(input(root, "note")?.value).toBe("")
	expect(text(root.querySelector('button[type="submit"]'))).toBe("Save purchase")
})

test("adding hands back a new purchase on the card, stamped addedAt now", async () => {
	const { element } = await mount({ purchase: null, now: () => NOW })
	const got = saved(element)
	await type(element, "amount", "250")
	await type(element, "note", " lunch ")
	await submit(element)
	expect(got).toHaveLength(1)
	expect(got[0]).toMatchObject({
		cardId: "kb",
		date: "2026-10-30",
		amount: 250_00,
		note: "lunch",
		addedAt: NOW.toISOString(),
	})
	expect(got[0]?.id).toMatch(/\S/)
})

test("a retried add keeps the id made when the sheet opened, and the typing", async () => {
	const { element, root } = await mount({ purchase: null, now: () => NOW })
	const got = saved(element)
	await type(element, "amount", "250")
	await submit(element)
	element.error = "Could not save. disk is full"
	element.groups = [{ ...group }]
	await element.updateComplete
	expect(input(root, "amount")?.value).toBe("250")
	await submit(element)
	expect(got).toHaveLength(2)
	expect(got[1]?.id).toBe(got[0]?.id ?? "")
})

test("adding warns about a future date or the close day, without refusing", async () => {
	const { element, root } = await mount({ purchase: null })
	const got = saved(element)
	await type(element, "amount", "10")
	await type(element, "date", "2026-10-18")
	expect(root.querySelector('[data-testid="close-date-warning"]')).not.toBe(null)
	await type(element, "date", "2026-11-02")
	expect(root.querySelector('[data-testid="future-date-warning"]')).not.toBe(null)
	await submit(element)
	expect(got).toHaveLength(1)
})
