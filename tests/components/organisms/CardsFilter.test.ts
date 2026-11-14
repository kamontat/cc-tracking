import type { LocationRecord } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import CardsFilter from "#components/organisms/CardsFilter.svelte"
import { type CardsView, DEFAULT_CARDS_VIEW } from "#lib/domain/cards-view"
import { setLocale } from "#lib/i18n/index"

/**
 * The Cards page's filter sheet: *Kept in*, *Account holder* and *Sort by*, counted live, with
 * *Clear all* and *Show N cards*. Ported from the legacy `cc-cards-filter` tests.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const places: LocationRecord[] = [
	{ id: "phichit", name: "Phichit", takesPurchases: false },
	{ id: "krabi", name: "Krabi", takesPurchases: true },
	{ id: "bangkok", name: "Bangkok", takesPurchases: false },
]

/** Lets the sheet's exit play (at most `EXIT_TIMEOUT_MS`) and whatever follows it run. */
const settle = async () => {
	await new Promise((resolve) => setTimeout(resolve, 450))
	flushSync()
}

type Props = {
	view?: CardsView
	locations?: LocationRecord[]
	count?: (view: CardsView) => number
}

const show = (props: Props = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const applied: CardsView[] = []
	let closed = 0
	mounted = mount(CardsFilter, {
		target: document.body,
		props: {
			view: props.view ?? DEFAULT_CARDS_VIEW,
			locations: props.locations ?? places,
			count: props.count ?? ((v: CardsView) => 5 - v.locations.length - v.owners.length),
			onapply: (view: CardsView) => applied.push(view),
			onclose: () => {
				closed += 1
			},
		},
	})
	flushSync()
	const root = document.body
	return {
		root,
		applied,
		closed: () => closed,
		click: (selector: string) => {
			const target = root.querySelector<HTMLElement>(selector)
			if (!target) throw new Error(`no ${selector}`)
			target.click()
			flushSync()
		},
	}
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("offers Kept in, Account holder and Sort by, counting cards live", () => {
	const { root, click } = show()
	expect([...root.querySelectorAll("legend")].map((l) => text(l))).toEqual([
		"Kept in",
		"Account holder",
		"Usage",
		"Balance",
		"Sort by",
		"Group by",
	])
	expect([...root.querySelectorAll("[data-by]")].map((b) => text(b))).toEqual([
		"Place",
		"Account holder",
		"Limit group",
		"None",
	])
	expect(root.querySelector("[data-by=place]")?.getAttribute("aria-pressed")).toBe("true")
	expect([...root.querySelectorAll("[data-location]")].map((b) => text(b))).toEqual(["Bangkok", "Krabi", "Phichit"])
	expect([...root.querySelectorAll("[data-owner]")].map((b) => text(b))).toEqual(["KC", "NT", "RI"])
	const chip = root.querySelector("[data-location=krabi]")
	expect(chip?.getAttribute("type")).toBe("button")
	expect(chip?.getAttribute("data-variant")).toBe("quiet")
	expect(chip?.getAttribute("aria-pressed")).toBe("false")
	expect([...root.querySelectorAll("[data-sort]")].map((b) => text(b))).toEqual([
		"Card",
		"Room",
		"Name",
		"Close date",
		"Due date",
		"Used",
	])
	expect([...root.querySelectorAll("[data-usage]")].map((b) => text(b))).toEqual(["Used", "Not used"])
	expect([...root.querySelectorAll("[data-state]")].map((b) => text(b))).toEqual([
		"Owes",
		"Overdue",
		"Due in 7 days",
		"Has credit",
	])
	expect(root.querySelector("[data-sort=card]")?.getAttribute("aria-pressed")).toBe("true")
	expect([...root.querySelectorAll("[data-dir]")].map((b) => text(b))).toEqual(["↑ First", "↓ Last"])
	expect(text(root.querySelector("[data-action=apply]"))).toBe("Show 5 cards")
	click("[data-owner=NT]")
	expect(root.querySelector("[data-owner=NT]")?.getAttribute("aria-pressed")).toBe("true")
	expect(text(root.querySelector("[data-action=apply]"))).toBe("Show 4 cards")
})

test("the sheet is titled Filter cards", () => {
	const { root } = show()
	expect(root.querySelector("dialog")?.hasAttribute("open")).toBe(true)
	expect(text(root.querySelector("dialog h2"))).toBe("Filter cards")
})

test("every stored place is offered A to Z by its shown name, in the reader's language", () => {
	const { root } = show({
		locations: [
			...places,
			{ id: "chiang-mai", name: "Chiang Mai", takesPurchases: false },
			{ id: "krabi-2", name: "Ao Nang", takesPurchases: false },
		],
	})
	const offered = () =>
		[...root.querySelectorAll<HTMLElement>("[data-location]")].map((b) => [b.dataset["location"], text(b)])
	expect(offered()).toEqual([
		["krabi-2", "Ao Nang"],
		["bangkok", "Bangkok"],
		["chiang-mai", "Chiang Mai"],
		["krabi", "Krabi"],
		["phichit", "Phichit"],
	])
	setLocale("th")
	flushSync()
	const names = offered().map(([, name]) => name as string)
	expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "th")))
	expect(names).toContain("กระบี่")
	expect(text(root.querySelector("dialog h2"))).not.toBe("Filter cards")
})

test("one card reads singular; none disables the button", () => {
	const one = show({ count: () => 1 })
	expect(text(one.root.querySelector("[data-action=apply]"))).toBe("Show 1 card")
	const none = show({ count: () => 0 })
	const apply = none.root.querySelector("[data-action=apply]") as HTMLButtonElement
	expect(text(apply)).toBe("Nothing matches")
	expect(apply.disabled).toBe(true)
})

test("apply lets the sheet go, then hands back the draft view", async () => {
	const { root, click, applied } = show({ view: { ...DEFAULT_CARDS_VIEW, q: "kb" } })
	click("[data-location=krabi]")
	click("[data-owner=RI]")
	click("[data-sort=room]")
	click("[data-by=limit]")
	click("[data-usage=unused]")
	click("[data-state=credit]")
	expect(root.querySelector("[data-usage=unused]")?.getAttribute("aria-pressed")).toBe("true")
	expect(root.querySelector("[data-sort=room]")?.getAttribute("aria-pressed")).toBe("true")
	expect(root.querySelector("[data-dir=desc]")?.getAttribute("aria-pressed")).toBe("true")
	click("[data-action=apply]")
	await settle()
	expect(applied).toEqual([
		{
			q: "kb",
			locations: ["krabi"],
			owners: ["RI"],
			usage: ["unused"],
			states: ["credit"],
			sort: "room",
			dir: "desc",
			by: "limit",
		},
	])
})

test("the draft starts from the view and leaves it untouched", () => {
	const view: CardsView = { ...DEFAULT_CARDS_VIEW, owners: ["KC"] }
	const { root, click } = show({ view })
	expect(root.querySelector("[data-owner=KC]")?.getAttribute("aria-pressed")).toBe("true")
	click("[data-owner=NT]")
	expect(view).toEqual({ ...DEFAULT_CARDS_VIEW, owners: ["KC"] })
})

test("Clear all resets the draft but keeps the search", async () => {
	const { click, applied } = show({
		view: {
			q: "kb",
			locations: ["krabi"],
			owners: ["KC"],
			usage: ["used"],
			states: ["owes"],
			sort: "name",
			dir: "desc",
			by: "holder",
		},
	})
	click("[data-action=clear]")
	click("[data-action=apply]")
	await settle()
	expect(applied).toEqual([{ ...DEFAULT_CARDS_VIEW, q: "kb" }])
})

test("Close calls onclose and applies nothing", async () => {
	const { click, closed, applied } = show()
	click("[data-action=close]")
	await settle()
	expect(closed()).toBe(1)
	expect(applied).toEqual([])
})

test("there is no Not in a group chip: every card has a limit group (RD-27)", () => {
	const { root } = show()
	expect(root.querySelector("[data-ungrouped]")).toBeNull()
})
