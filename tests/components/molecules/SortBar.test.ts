import type { OwedSort } from "#lib/domain/owed"
import type { SortDir } from "#lib/domain/sort"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import SortBar from "#components/molecules/SortBar.svelte"
import { OWED_DIRS, OWED_SORTS } from "#lib/domain/owed"
import { setLocale } from "#lib/i18n/index"

/**
 * A list's sort on its own row, for a tab with no filter sheet (Home's _Owed_ and _Ready to use_):
 * a _Sort_ chip holding a select of the fields, and the order switch beside it.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const show = (props: { field?: OwedSort; dir?: SortDir; onchange?: (field: OwedSort, dir: SortDir) => void } = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(SortBar<OwedSort>, {
		target: document.body,
		props: {
			fields: OWED_SORTS,
			defaults: OWED_DIRS,
			initial: "urgency",
			field: props.field ?? "urgency",
			dir: props.dir ?? "asc",
			onchange: props.onchange ?? (() => {}),
		},
	})
	flushSync()
	return document.body.querySelector(".sort-bar") as HTMLElement
}

const flat = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("the sort chip picks a field, in its own direction", () => {
	const picks: [OwedSort, SortDir][] = []
	const root = show({ onchange: (field, dir) => picks.push([field, dir]) })
	const chip = root.querySelector("label.chip") as HTMLElement
	expect(chip.hasAttribute("data-active")).toBe(false)
	expect(flat(chip).startsWith("Sort")).toBe(true)
	const select = root.querySelector("select[name=sort]") as HTMLSelectElement
	expect(Array.from(select.options).map((o) => o.value)).toEqual(["urgency", "card", "due", "left"])
	expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(["Urgency", "Card", "Due date", "Owed"])
	select.value = "left"
	select.dispatchEvent(new Event("change", { bubbles: true }))
	expect(picks).toEqual([["left", "desc"]])
})

test("the order switch shows both ways, the field's own first, and picks one", () => {
	const picks: [OwedSort, SortDir][] = []
	const root = show({ field: "left", dir: "desc", onchange: (field, dir) => picks.push([field, dir]) })
	expect(root.querySelector("fieldset.filter-seg")?.getAttribute("aria-label")).toBe("Order")
	const ways = [...root.querySelectorAll<HTMLButtonElement>(".filter-seg button[data-dir]")]
	expect(
		ways.map((b) => [b.dataset["dir"], flat(b), b.getAttribute("aria-label"), b.getAttribute("aria-pressed")]),
	).toEqual([
		["desc", "↓", "Most owed", "true"],
		["asc", "↑", "Least owed", "false"],
	])
	expect(ways[0]?.getAttribute("type")).toBe("button")
	ways[1]?.click()
	expect(picks).toEqual([["left", "asc"]])
})

test("anything but the first field in its own direction marks the chip active", () => {
	expect(show({ dir: "desc" }).querySelector("label.chip")?.hasAttribute("data-active")).toBe(true)
	const root = show({ field: "due" })
	expect(root.querySelector("label.chip")?.hasAttribute("data-active")).toBe(true)
	expect((root.querySelector("select[name=sort]") as HTMLSelectElement).value).toBe("due")
})

test("the words follow a switch of language", () => {
	const root = show()
	setLocale("th")
	flushSync()
	expect(flat(root.querySelector("label.chip")).startsWith("Sort")).toBe(false)
})

// The chip's select paints its own chevron, with a token gutter, as the card form's selects do.
test("the sort chip's select paints its own chevron", async () => {
	const source = await Bun.file("src/components/molecules/SortBar.svelte").text()
	expect(source).toMatch(/\.chip select\s*\{[^}]*appearance: none/)
	expect(source).toMatch(/\.chip select\s*\{[^}]*background-image: var\(--cc-select-chevron\)/)
	expect(source).toMatch(
		/\.chip select\s*\{[^}]*padding-inline-end: calc\(var\(--cc-space-3\) \* 2 \+ var\(--cc-select-chevron-size\)\)/,
	)
})
