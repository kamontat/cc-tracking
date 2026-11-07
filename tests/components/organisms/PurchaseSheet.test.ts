import type { Card, LimitGroup, Purchase } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import PurchaseSheet from "#components/organisms/PurchaseSheet.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * A purchase in a sheet on the card page: the card fixed and named, then date, amount and note.
 * Ported from the legacy `cc-purchase-sheet` tests, against the same markup.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

/** Flushes Svelte's updates and anything they await. */
const settle = async () => {
	for (let i = 0; i < 5; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

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

interface Shown {
	card?: Card | null
	groups?: LimitGroup[]
	purchase?: Purchase | null
	now?: () => Date
	today?: string
	error?: string
	busy?: boolean
}

/**
 * Mounts the sheet; `set` changes a prop afterwards, as the page would. The props read through
 * a `SvelteMap`, so a change reaches the mounted sheet as a reactive prop.
 */
const show = async (props: Shown = {}) => {
	document.body.innerHTML = ""
	const values = new SvelteMap<string, unknown>(
		Object.entries({ card, groups: [group], purchase, today: "2026-10-30", ...props }),
	)
	const saved: Purchase[] = []
	let closed = 0
	mounted = mount(PurchaseSheet, {
		target: document.body,
		props: {
			get card() {
				return (values.get("card") as Card | null | undefined) ?? null
			},
			get groups() {
				return (values.get("groups") as LimitGroup[] | undefined) ?? []
			},
			get purchase() {
				return (values.get("purchase") as Purchase | null | undefined) ?? null
			},
			get now() {
				return (values.get("now") as (() => Date) | undefined) ?? (() => new Date())
			},
			get today() {
				return (values.get("today") as string | undefined) ?? ""
			},
			get error() {
				return (values.get("error") as string | undefined) ?? ""
			},
			get busy() {
				return (values.get("busy") as boolean | undefined) ?? false
			},
			onsave: (entry: Purchase) => saved.push(entry),
			onclose: () => {
				closed += 1
			},
		},
	})
	await settle()
	return {
		root: document.body,
		saved,
		closed: () => closed,
		set: async (changes: Shown) => {
			for (const [key, value] of Object.entries(changes)) values.set(key, value)
			await settle()
		},
	}
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const input = (root: ParentNode, name: string) => root.querySelector<HTMLInputElement>(`input[name="${name}"]`)

const heading = () => text(document.querySelector("dialog h2"))

const type = async (name: string, value: string) => {
	const field = input(document, name)
	if (!field) throw new Error(`no ${name} field`)
	field.value = value
	field.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

const submit = async () => {
	document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
}

test("a sheet headed Edit purchase, the card fixed and named, the fields filled", async () => {
	const { root } = await show()
	expect(root.querySelector("dialog")).not.toBeNull()
	expect(heading()).toBe("Edit purchase")
	const named = root.querySelector('[data-field="card"]')
	expect(text(named?.querySelector(".mini"))).toBe("4821")
	expect(named?.querySelector(".mini")?.getAttribute("data-g")).toBeNull()
	expect(text(named?.querySelector(".card-label"))).toBe("kb) KBank Visa")
	expect(named?.querySelector("select, input")).toBeNull()
	expect(input(root, "date")?.value).toBe("2026-10-02")
	expect(input(root, "amount")?.value).toBe("1234.50")
	expect(input(root, "note")?.value).toBe("fuel")
})

test("the card chip wears its group's colour", async () => {
	const { root } = await show({ groups: [{ ...group, color: "teal" }] })
	expect(root.querySelector('[data-field="card"] .mini')?.getAttribute("data-g")).toBe("teal")
})

test("Save changes hands back the purchase with its id, card and addedAt kept", async () => {
	const { root, saved } = await show()
	await type("date", "2026-10-03")
	await type("amount", "500")
	await type("note", " tyres ")
	expect(text(root.querySelector('button[type="submit"]'))).toBe("Save changes")
	await submit()
	expect(saved).toEqual([
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
	const { saved } = await show({ purchase: older })
	await submit()
	expect(saved).toHaveLength(1)
	expect(saved[0] && "addedAt" in saved[0]).toBe(false)
})

test("a bad amount or date says why and sends nothing", async () => {
	const { root, saved } = await show()
	await type("amount", "abc")
	await submit()
	expect(text(root.querySelector('form [role="alert"]'))).toBe("Enter the amount in baht, like 1234.56.")
	await type("amount", "10")
	await type("date", "2026-02-31")
	await submit()
	expect(text(root.querySelector('form [role="alert"]'))).toBe("That date does not exist. Use YYYY-MM-DD.")
	expect(saved).toEqual([])
})

test("the form's error follows a language switch", async () => {
	const { root } = await show()
	await type("amount", "abc")
	await submit()
	const before = text(root.querySelector('form [role="alert"]'))
	setLocale("th")
	await settle()
	expect(text(root.querySelector('form [role="alert"]'))).not.toBe(before)
	expect(heading()).not.toBe("Edit purchase")
})

test("a date ahead of today or on the close day is warned about, not refused", async () => {
	const { root } = await show()
	await type("date", "2026-11-02")
	expect(root.querySelector('[data-testid="future-date-warning"]')).not.toBe(null)
	await type("date", "2026-10-18")
	expect(root.querySelector('[data-testid="close-date-warning"]')).not.toBe(null)
})

test("a failed save shows why in the sheet and keeps what was typed", async () => {
	const { root, set } = await show()
	await type("note", "typed")
	await set({ error: "Could not save. disk is full", purchase: { ...purchase } })
	expect(text(root.querySelector(".error-banner"))).toContain("disk is full")
	// Inside a sheet the banner has no retry of its own.
	expect(root.querySelector(".error-banner button")).toBeNull()
	expect(input(root, "note")?.value).toBe("typed")
})

test("while busy the save waits and the sheet holds", async () => {
	const { root, saved, closed } = await show({ busy: true })
	expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
	await submit()
	expect(saved).toEqual([])
	root.querySelector<HTMLButtonElement>('[data-action="close"]')?.click()
	await settle()
	expect(closed()).toBe(0)
})

test("closing the sheet asks the page to close", async () => {
	const { root, closed } = await show()
	root.querySelector<HTMLButtonElement>('[data-action="close"]')?.click()
	await settle()
	expect(closed()).toBe(1)
})

const NOW = new Date("2026-10-30T05:00:00.000Z")

test("with no purchase the sheet adds one: headed Add purchase, blank, dated today", async () => {
	const { root } = await show({ purchase: null })
	expect(heading()).toBe("Add purchase")
	expect(text(root.querySelector('[data-field="card"] .card-label'))).toBe("kb) KBank Visa")
	expect(input(root, "date")?.value).toBe("2026-10-30")
	expect(input(root, "amount")?.value).toBe("")
	expect(input(root, "note")?.value).toBe("")
	expect(text(root.querySelector('button[type="submit"]'))).toBe("Save purchase")
})

test("adding hands back a new purchase on the card, stamped addedAt now", async () => {
	const { saved } = await show({ purchase: null, now: () => NOW })
	await type("amount", "250")
	await type("note", " lunch ")
	await submit()
	expect(saved).toHaveLength(1)
	expect(saved[0]).toMatchObject({
		cardId: "kb",
		date: "2026-10-30",
		amount: 250_00,
		note: "lunch",
		addedAt: NOW.toISOString(),
	})
	expect(saved[0]?.id).toMatch(/\S/)
})

test("a retried add keeps the id made when the sheet opened, and the typing", async () => {
	const { root, saved, set } = await show({ purchase: null, now: () => NOW })
	await type("amount", "250")
	await submit()
	await set({ error: "Could not save. disk is full", groups: [{ ...group }], card: { ...card } })
	expect(input(root, "amount")?.value).toBe("250")
	await submit()
	expect(saved).toHaveLength(2)
	expect(saved[1]?.id).toBe(saved[0]?.id ?? "")
})

test("adding warns about a future date or the close day, without refusing", async () => {
	const { root, saved } = await show({ purchase: null })
	await type("amount", "10")
	await type("date", "2026-10-18")
	expect(root.querySelector('[data-testid="close-date-warning"]')).not.toBe(null)
	await type("date", "2026-11-02")
	expect(root.querySelector('[data-testid="future-date-warning"]')).not.toBe(null)
	await submit()
	expect(saved).toHaveLength(1)
})

test("the look is drawn with the cc tokens only", async () => {
	const source = await Bun.file("src/components/organisms/PurchaseSheet.svelte").text()
	const style = source.slice(source.indexOf("<style>"))
	expect(style).toContain(".warning")
	expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|\d(px|rem)\b/i)
})
