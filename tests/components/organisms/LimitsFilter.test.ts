import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import LimitsFilter from "#components/organisms/LimitsFilter.svelte"
import { DEFAULT_LIMITS_VIEW, type LimitsView } from "#lib/domain/limits-view"
import { setLocale } from "#lib/i18n/index"

/**
 * The Limits tab's filter sheet: *Account holder* on its Filter tab and *Sort by* (name, room,
 * used) on its Sort tab, counted live, with *Clear all* and *Show N limits*.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

/** Lets the sheet's exit play and whatever follows it run. */
const settle = async () => {
	await new Promise((resolve) => setTimeout(resolve, 450))
	flushSync()
}

const show = (view: LimitsView = DEFAULT_LIMITS_VIEW, tab: "filter" | "sort" = "filter") => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const applied: LimitsView[] = []
	let closed = 0
	mounted = mount(LimitsFilter, {
		target: document.body,
		props: {
			tab,
			view,
			count: (v: LimitsView) => 3 - v.owners.length,
			onapply: (next: LimitsView) => applied.push(next),
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
	return { root, applied, click, closed: () => closed }
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("is Filter limits, with the account holders and a Sort tab, but no Group tab", () => {
	const { root } = show()
	expect(text(root.querySelector("dialog h2"))).toBe("Filter limits")
	expect([...root.querySelectorAll("[data-owner]")].map((b) => text(b))).toEqual(["KC", "NT", "RI"])
	expect([...root.querySelectorAll("[data-sort]")].map((b) => b.getAttribute("data-sort"))).toEqual([
		"name",
		"room",
		"used",
	])
	expect(root.querySelector("[data-by]")).toBeNull()
})

test("counts live, and hands back the draft on apply", async () => {
	const { root, click, applied } = show()
	expect(text(root.querySelector("[data-action=apply]"))).toBe("Show 3 limits")
	click("[data-owner=NT]")
	expect(text(root.querySelector("[data-action=apply]"))).toBe("Show 2 limits")
	click("[data-sort=used]")
	click("[data-action=apply]")
	await settle()
	expect(applied).toEqual([{ ...DEFAULT_LIMITS_VIEW, owners: ["NT"], sort: "used", dir: "desc" }])
})

test("one limit reads singular", () => {
	const { root, click } = show()
	click("[data-owner=KC]")
	click("[data-owner=NT]")
	expect(text(root.querySelector("[data-action=apply]"))).toBe("Show 1 limit")
})

test("Clear all resets the draft but keeps the search", async () => {
	const { click, applied } = show({ q: "kb", owners: ["KC"], sort: "room", dir: "asc" })
	click("[data-action=clear]")
	click("[data-action=apply]")
	await settle()
	expect(applied).toEqual([{ ...DEFAULT_LIMITS_VIEW, q: "kb" }])
})
