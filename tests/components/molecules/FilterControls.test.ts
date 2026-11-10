import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import FilterControls from "#components/molecules/FilterControls.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The search box, the Filter button with its count, the sort chip and a removable chip per
 * filter, drawn in the light DOM for app.css's `.tx-controls`. Ported from the legacy
 * `filterControls` template.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

type Chip = { key: string; label: string; short?: string; clear: () => void }

const show = (props: { q?: string; count?: number; sort?: string; chips?: Chip[] } = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const searched: string[] = []
	let opened = 0
	mounted = mount(FilterControls, {
		target: document.body,
		props: {
			q: props.q ?? "",
			placeholder: "Search cards",
			onsearch: (q: string) => searched.push(q),
			onopen: () => {
				opened += 1
			},
			count: props.count ?? 0,
			sort: props.sort ?? "By place",
			chips: props.chips ?? [],
		},
	})
	flushSync()
	const find = <T extends Element = HTMLElement>(selector: string) => document.body.querySelector<T>(selector)
	return { searched, opened: () => opened, find }
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("draws the search box inside the tx-search label, with its name, label and placeholder", () => {
	const { find } = show({ q: "kb" })
	const input = find<HTMLInputElement>(".tx-controls .tx-ctl label.tx-search input.search")
	expect(input).not.toBeNull()
	expect(input?.type).toBe("search")
	expect(input?.name).toBe("q")
	expect(input?.value).toBe("kb")
	expect(input?.getAttribute("aria-label")).toBe("Search")
	expect(input?.placeholder).toBe("Search cards")
	expect(find(".tx-search svg.icon")).not.toBeNull()
})

test("typing hands the box's value to onsearch, even for an input event that does not bubble", () => {
	const { find, searched } = show()
	const input = find<HTMLInputElement>("input.search") as HTMLInputElement
	input.value = "kr"
	input.dispatchEvent(new Event("input"))
	input.value = "kra"
	input.dispatchEvent(new Event("input", { bubbles: true }))
	expect(searched).toEqual(["kr", "kra"])
})

test("the Filter button and the sort chip both open the sheet", () => {
	const { find, opened } = show({ sort: "Most room" })
	const filter = find<HTMLButtonElement>("button.tx-fbtn") as HTMLButtonElement
	expect(filter.type).toBe("button")
	expect(filter.dataset["variant"]).toBe("quiet")
	expect(filter.dataset["action"]).toBe("filter")
	expect(filter.querySelector("svg.icon")).not.toBeNull()
	expect(text(filter)).toBe("Filter")
	filter.click()
	const sort = find<HTMLButtonElement>(".tx-chips button.tx-chip.tx-sort") as HTMLButtonElement
	expect(sort.dataset["action"]).toBe("sort")
	expect(sort.dataset["variant"]).toBe("quiet")
	expect(text(sort)).toBe("Sort: Most room ▾")
	sort.click()
	expect(opened()).toBe(2)
})

test("the Filter button counts the filters in use, and shows no badge with none", () => {
	expect(show().find(".tx-count")).toBeNull()
	const { find } = show({ count: 2 })
	expect(find("b.tx-count")?.textContent).toBe("2")
})

test("each filter is a removable chip that clears it", () => {
	const cleared: string[] = []
	const { find } = show({
		chips: [
			{ key: "loc:krabi", label: "Krabi", clear: () => cleared.push("krabi") },
			{ key: "owner:KC", label: "KC", clear: () => cleared.push("KC") },
		],
	})
	const chip = find<HTMLButtonElement>('[data-chip="loc:krabi"]') as HTMLButtonElement
	expect(chip.classList.contains("tx-chip")).toBe(true)
	expect(chip.classList.contains("tx-sort")).toBe(false)
	expect(chip.dataset["variant"]).toBe("quiet")
	expect(chip.type).toBe("button")
	expect(chip.getAttribute("aria-label")).toBe("Remove Krabi")
	expect(text(chip)).toBe("Krabi ×")
	chip.click()
	find<HTMLButtonElement>('[data-chip="owner:KC"]')?.click()
	expect(cleared).toEqual(["krabi", "KC"])
})

test("a chip with a short form draws both, the short one hidden from a screen reader (UI-14)", () => {
	const { find } = show({
		chips: [{ key: "card:A", label: "A) A card (1234)", short: "A) A card", clear: () => {} }],
	})
	const chip = find('[data-chip="card:A"]')
	expect(chip?.querySelector(".cl .cl-full")?.textContent).toBe("A) A card (1234)")
	expect(chip?.querySelector(".cl .cl-short")?.textContent).toBe("A) A card")
	expect(chip?.querySelector(".cl-short")?.getAttribute("aria-hidden")).toBe("true")
	expect(chip?.getAttribute("aria-label")).toBe("Remove A) A card (1234)")
})

test("its words follow a language switch", () => {
	const { find } = show({ chips: [{ key: "loc:krabi", label: "Krabi", clear: () => {} }] })
	setLocale("th")
	flushSync()
	expect(text(find("button.tx-fbtn"))).not.toBe("Filter")
	expect(find("input.search")?.getAttribute("aria-label")).not.toBe("Search")
	expect(find('[data-chip="loc:krabi"]')?.getAttribute("aria-label")).not.toBe("Remove Krabi")
})

test("with no sort given, there is no sort chip", () => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(FilterControls, {
		target: document.body,
		props: { q: "", placeholder: "Search", onsearch: () => {}, onopen: () => {}, count: 0, chips: [] },
	})
	flushSync()
	expect(document.querySelector('[data-action="sort"]')).toBeNull()
	expect(document.querySelector('[data-action="filter"]')).not.toBeNull()
})
