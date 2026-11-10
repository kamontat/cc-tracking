import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import SortChoices from "#components/molecules/SortChoices.svelte"
import { setLocale } from "#lib/i18n/index"

/** A filter sheet's *Sort* section: the fields as chips, then the two orders of the picked one. */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

type Pick = { field: string; dir: "asc" | "desc" }

const show = (field = "date", dir: "asc" | "desc" = "desc") => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const picks: Pick[] = []
	mounted = mount(SortChoices, {
		target: document.body,
		props: {
			legend: "Sort",
			fields: ["date", "amount", "name"],
			defaults: { date: "desc", amount: "desc", name: "asc" },
			field,
			dir,
			onchange: (pick: Pick) => picks.push(pick),
		},
	})
	flushSync()
	const root = document.body
	const text = (selector: string) =>
		[...root.querySelectorAll(selector)].map((el) => el.textContent?.replace(/\s+/g, " ").trim())
	return { root, picks, text }
}

test("a chip per field, the picked one pressed", () => {
	const { root, text } = show()
	expect(root.querySelector("fieldset.filter-group > legend")?.textContent).toBe("Sort")
	expect(text("[data-sort]")).toEqual(["Date", "Amount", "Name"])
	expect(root.querySelector("[data-sort=date]")?.getAttribute("aria-pressed")).toBe("true")
	expect(root.querySelector("[data-sort=amount]")?.getAttribute("aria-pressed")).toBe("false")
})

test("the picked field's two orders, its own first, in a named group", () => {
	const { root, text } = show()
	const group = root.querySelector("fieldset.filter-order")
	expect(group?.getAttribute("aria-label")).toBe("Order")
	expect(text("[data-dir]")).toEqual(["↓ Newest first", "↑ Oldest first"])
	expect(root.querySelector("[data-dir=desc]")?.getAttribute("aria-pressed")).toBe("true")
	const name = show("name", "desc")
	expect(name.text("[data-dir]")).toEqual(["↑ A to Z", "↓ Z to A"])
	expect(name.root.querySelector("[data-dir=desc]")?.getAttribute("aria-pressed")).toBe("true")
})

test("a new field starts in its own direction; an order keeps the field", () => {
	const { root, picks } = show("date", "asc")
	root.querySelector<HTMLElement>("[data-sort=name]")?.click()
	root.querySelector<HTMLElement>("[data-sort=amount]")?.click()
	root.querySelector<HTMLElement>("[data-dir=desc]")?.click()
	expect(picks).toEqual([
		{ field: "name", dir: "asc" },
		{ field: "amount", dir: "desc" },
		{ field: "date", dir: "desc" },
	])
})

test("the picked field tapped again changes nothing", () => {
	const { root, picks } = show()
	root.querySelector<HTMLElement>("[data-sort=date]")?.click()
	expect(picks).toEqual([])
})

test("the words follow a switch of language", () => {
	const { root } = show()
	setLocale("th")
	flushSync()
	expect(root.querySelector("[data-dir=desc]")?.textContent).toContain("ใหม่สุดก่อน")
})
