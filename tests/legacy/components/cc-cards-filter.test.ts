import { afterEach, expect, test } from "vitest"
import "#legacy/components/cc-cards-filter"
import type { LocationRecord } from "#lib/domain/types"

import { type CcCardsFilter, cardsSortLabel } from "#legacy/components/cc-cards-filter"
import { type CardsView, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view"
import { setLocale } from "#lib/i18n/index"

afterEach(() => setLocale("en"))

const places: LocationRecord[] = [
	{ id: "phichit", name: "Phichit", takesPurchases: false },
	{ id: "krabi", name: "Krabi", takesPurchases: true },
	{ id: "bangkok", name: "Bangkok", takesPurchases: false },
]

const mount = async (props: Partial<CcCardsFilter> = {}) => {
	document.body.innerHTML = ""
	const element = document.createElement("cc-cards-filter") as CcCardsFilter
	element.view = DEFAULT_CARDS_VIEW
	element.locations = places
	element.count = (v: CardsView) => 5 - v.locations.length - v.owners.length
	Object.assign(element, props)
	document.body.append(element)
	await element.updateComplete
	return { element, root: element.shadowRoot as ShadowRoot }
}

const click = async (element: CcCardsFilter, selector: string) => {
	element.shadowRoot?.querySelector<HTMLElement>(selector)?.click()
	await element.updateComplete
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("offers Kept in, Account holder and Sort by, counting cards live", async () => {
	const { element, root } = await mount()
	expect([...root.querySelectorAll("legend")].map((l) => text(l))).toEqual(["Kept in", "Account holder", "Sort by"])
	expect([...root.querySelectorAll("[data-location]")].map((b) => text(b))).toEqual(["Bangkok", "Krabi", "Phichit"])
	expect([...root.querySelectorAll("[data-owner]")].map((b) => text(b))).toEqual(["KC", "NT", "RI"])
	const group = root.querySelector("[role=radiogroup]")
	expect([...(group?.querySelectorAll("label") ?? [])].map((b) => text(b))).toEqual([
		"By place",
		"Most room",
		"Name",
		"Close day",
	])
	expect(
		[...root.querySelectorAll<HTMLInputElement>("input[type=radio][name=sort]")].map((r) => [r.value, r.checked]),
	).toEqual([
		["place", true],
		["room", false],
		["name", false],
		["close", false],
	])
	expect(text(root.querySelector("[data-action=apply]"))).toBe("Show 5 cards")
	await click(element, "[data-owner=NT]")
	expect(text(root.querySelector("[data-action=apply]"))).toBe("Show 4 cards")
})

test("the sheet is titled Filter cards", async () => {
	const { root } = await mount()
	expect(root.querySelector("cc-modal")?.getAttribute("heading")).toBe("Filter cards")
})

test("every stored place is offered A to Z by its shown name, in the reader's language", async () => {
	const { element, root } = await mount({
		locations: [
			...places,
			{ id: "chiang-mai", name: "Chiang Mai", takesPurchases: false },
			{ id: "krabi-2", name: "Ao Nang", takesPurchases: false },
		],
	})
	const offered = (r: ShadowRoot) =>
		[...r.querySelectorAll<HTMLElement>("[data-location]")].map((b) => [b.dataset["location"], text(b)])
	expect(offered(root)).toEqual([
		["krabi-2", "Ao Nang"],
		["bangkok", "Bangkok"],
		["chiang-mai", "Chiang Mai"],
		["krabi", "Krabi"],
		["phichit", "Phichit"],
	])
	setLocale("th")
	await element.updateComplete
	const names = offered(root).map(([, name]) => name as string)
	expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "th")))
	expect(names).toContain("กระบี่")
})

test("one card reads singular; none disables the button", async () => {
	const one = await mount({ count: () => 1 })
	expect(text(one.root.querySelector("[data-action=apply]"))).toBe("Show 1 card")
	const none = await mount({ count: () => 0 })
	const apply = none.root.querySelector("[data-action=apply]") as HTMLButtonElement
	expect(text(apply)).toBe("Nothing matches")
	expect(apply.disabled).toBe(true)
})

test("apply emits the draft view", async () => {
	const { element } = await mount({
		view: { ...DEFAULT_CARDS_VIEW, q: "kb" },
	})
	let detail: CardsView | undefined
	element.addEventListener("apply", (e) => {
		detail = (e as CustomEvent<CardsView>).detail
	})
	await click(element, "[data-location=krabi]")
	await click(element, "[data-owner=RI]")
	await click(element, "input[name=sort][value=room]")
	expect(element.shadowRoot?.querySelector<HTMLInputElement>("input[name=sort][value=room]")?.checked).toBe(true)
	await click(element, "[data-action=apply]")
	expect(detail).toEqual({
		q: "kb",
		locations: ["krabi"],
		owners: ["RI"],
		ungrouped: false,
		sort: "room",
	})
})

test("Clear all resets the draft but keeps the search", async () => {
	const { element } = await mount({
		view: {
			q: "kb",
			locations: ["krabi"],
			owners: ["KC"],
			ungrouped: false,
			sort: "name",
		},
	})
	let detail: CardsView | undefined
	element.addEventListener("apply", (e) => {
		detail = (e as CustomEvent<CardsView>).detail
	})
	await click(element, "[data-action=clear]")
	await click(element, "[data-action=apply]")
	expect(detail).toEqual({ ...DEFAULT_CARDS_VIEW, q: "kb" })
})

test("Close re-emits close", async () => {
	const { element, root } = await mount()
	let closed = false
	element.addEventListener("close", () => {
		closed = true
	})
	root.querySelector("cc-modal")?.dispatchEvent(new CustomEvent("close"))
	expect(closed).toBe(true)
})

test("each sort has its words", () => {
	expect(cardsSortLabel("place")).toBe("By place")
	expect(cardsSortLabel("close")).toBe("Close day")
	setLocale("th")
	expect(cardsSortLabel("room")).not.toBe("Most room")
})

test("a Not in a group chip toggles the draft and is handed back on apply", async () => {
	const { element, root } = await mount()
	const chip = () => root.querySelector<HTMLElement>("[data-ungrouped]") as HTMLElement
	expect(text(chip())).toBe("Not in a group")
	expect(chip().getAttribute("aria-pressed")).toBe("false")
	let detail: CardsView | undefined
	element.addEventListener("apply", (e) => {
		detail = (e as CustomEvent<CardsView>).detail
	})
	await click(element, "[data-ungrouped]")
	expect(chip().getAttribute("aria-pressed")).toBe("true")
	await click(element, "[data-action=apply]")
	await new Promise((resolve) => setTimeout(resolve, 400))
	expect(detail?.ungrouped).toBe(true)
})
