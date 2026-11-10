import type { Card } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import ListsFilter from "#components/organisms/ListsFilter.svelte"
import { DEFAULT_LISTS_FILTER, type ListsFilter as Filter } from "#lib/domain/transactions"
import { setLocale } from "#lib/i18n/index"

/**
 * The Lists view's filter sheet (DD-189): *Status*, *Card* and *Date*, no sort, as a draft
 * counted live that only the apply button hands back.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const card = (id: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
})

/** Lets the sheet's exit play and whatever follows it run. */
const settle = async () => {
	await new Promise((resolve) => setTimeout(resolve, 450))
	flushSync()
}

const show = (props: { filter?: Filter; count?: (filter: Filter) => number } = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const applied: Filter[] = []
	let closed = 0
	mounted = mount(ListsFilter, {
		target: document.body,
		props: {
			cards: [card("A"), card("B")],
			filter: props.filter ?? DEFAULT_LISTS_FILTER,
			count: props.count ?? ((f: Filter) => f.status.length + f.cards.length + (f.range ? 1 : 0) + 3),
			onapply: (filter: Filter) => applied.push(filter),
			onclose: () => {
				closed += 1
			},
		},
	})
	flushSync()
	const root = document.body
	const click = (selector: string) => {
		const target = root.querySelector<HTMLElement>(selector)
		if (!target) throw new Error(`no ${selector}`)
		target.click()
		flushSync()
	}
	return { root, applied, closed: () => closed, click }
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("a sheet of status, card and date, with no sort, counting lists", () => {
	const { root, click } = show()
	expect(text(root.querySelector("dialog h2"))).toBe("Filter lists")
	expect([...root.querySelectorAll("fieldset > legend")].map(text)).toEqual(["Status", "Card", "Date"])
	expect(root.querySelector("[data-sort]")).toBeNull()
	expect([...root.querySelectorAll("[data-status]")].map((b) => text(b))).toEqual([
		"Draft",
		"Waiting for the spender",
		"Saved",
	])
	expect(text(root.querySelector("[data-action=apply]"))).toBe("Show 3 lists")
	click("[data-status=sent]")
	expect(root.querySelector("[data-status=sent]")?.getAttribute("aria-pressed")).toBe("true")
	expect(text(root.querySelector("[data-action=apply]"))).toBe("Show 4 lists")
})

test("one list reads singular and none disables the button", () => {
	expect(text(show({ count: () => 1 }).root.querySelector("[data-action=apply]"))).toBe("Show 1 list")
	const apply = show({ count: () => 0 }).root.querySelector<HTMLButtonElement>("[data-action=apply]")
	expect(text(apply)).toBe("Nothing matches")
	expect(apply?.disabled).toBe(true)
})

test("apply hands back the draft, keeping the search text", async () => {
	const { click, applied } = show({ filter: { ...DEFAULT_LISTS_FILTER, q: "fuel" } })
	click("[data-status=saved]")
	click("[data-card=B]")
	click("[data-range=week]")
	click("[data-action=apply]")
	await settle()
	expect(applied).toEqual([{ ...DEFAULT_LISTS_FILTER, q: "fuel", status: ["saved"], cards: ["B"], range: "week" }])
})

test("Clear all resets the draft but keeps the search text; Close applies nothing", async () => {
	const { root, click, applied, closed } = show({
		filter: { ...DEFAULT_LISTS_FILTER, q: "x", status: ["draft"], range: "month" },
	})
	click("[data-action=clear]")
	expect(root.querySelector("[data-status=draft]")?.getAttribute("aria-pressed")).toBe("false")
	expect(root.querySelector("[data-range=month]")?.getAttribute("aria-pressed")).toBe("false")
	click("[data-action=close]")
	await settle()
	expect(closed()).toBe(1)
	expect(applied).toEqual([])
})

test("reads in Thai", () => {
	setLocale("th")
	const { root } = show()
	expect(text(root.querySelector("dialog h2"))).toBe("กรองใบรายการ")
	expect(text(root.querySelector("fieldset > legend"))).toBe("สถานะ")
	expect(text(root.querySelector("[data-action=apply]"))).toBe("แสดง 3 ใบ")
})
