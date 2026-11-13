import type { OwedSort } from "#lib/domain/owed"
import type { SortDir } from "#lib/domain/sort"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import SortSheet from "#components/organisms/SortSheet.svelte"
import { OWED_DIRS, OWED_SORTS } from "#lib/domain/owed"
import { setLocale } from "#lib/i18n/index"

/**
 * The filter sheet with only its *Sort* section, for a tab with a sort and no filters (Home's
 * _Owed_ and _Ready to use_): the fields and the order switch on a draft, *Clear all* back to the
 * list's own sort, and the apply button handing the pick back.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const show = (field: OwedSort = "left", dir: SortDir = "desc") => {
	const applied: [OwedSort, SortDir][] = []
	const closed: string[] = []
	mounted = mount(SortSheet<OwedSort>, {
		target: document.body,
		props: {
			heading: "Sort owed cards",
			fields: OWED_SORTS,
			defaults: OWED_DIRS,
			initial: "urgency",
			field,
			dir,
			shown: 2,
			onapply: (f: OwedSort, d: SortDir) => applied.push([f, d]),
			onclose: () => closed.push("close"),
		},
	})
	flushSync()
	const click = (selector: string) => {
		document.querySelector<HTMLElement>(selector)?.click()
		flushSync()
	}
	return { applied, closed, click }
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const pressed = (selector: string) =>
	[...document.querySelectorAll(`${selector}[aria-pressed="true"]`)].map((el) => (el as HTMLElement).dataset)

test("draws the sort section alone, no tabs, under its heading, the current sort picked", () => {
	show()
	expect(text(document.querySelector("dialog h2"))).toBe("Sort owed cards")
	expect(document.querySelector("[role=tab]")).toBeNull()
	expect(document.querySelector(".filter-sort")).not.toBeNull()
	expect([...document.querySelectorAll("[data-sort]")].map((el) => el.getAttribute("data-sort"))).toEqual([
		"urgency",
		"card",
		"due",
		"left",
	])
	expect(pressed("[data-sort]").map((d) => d["sort"])).toEqual(["left"])
	expect(pressed("[data-dir]").map((d) => d["dir"])).toEqual(["desc"])
	expect(text(document.querySelector("[data-action=apply]"))).toBe("Show 2 cards")
})

test("a pick is a draft until apply, which hands it back once the sheet slides away", async () => {
	const { applied, click } = show()
	click('[data-sort="due"]')
	click('[data-dir="desc"]')
	expect(applied).toEqual([])
	click("[data-action=apply]")
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(applied).toEqual([["due", "desc"]])
})

test("Clear all goes back to the list's own sort, in its own direction", async () => {
	const { applied, click } = show("left", "asc")
	click("[data-action=clear]")
	expect(pressed("[data-sort]").map((d) => d["sort"])).toEqual(["urgency"])
	expect(pressed("[data-dir]").map((d) => d["dir"])).toEqual(["asc"])
	click("[data-action=apply]")
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(applied).toEqual([["urgency", "asc"]])
})

test("reads in Thai", () => {
	setLocale("th")
	show()
	expect(text(document.querySelector("[data-action=apply]"))).toBe("แสดง 2 ใบ")
	expect(text(document.querySelector(".filter-sort legend"))).toBe("เรียงตาม")
})
