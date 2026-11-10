import type { SheetTab } from "#lib/ui/sheet-tab"

import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import FilterSheet from "#components/organisms/FilterSheet.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The frame every filter sheet shares: the sheet and its heading, tabs for *Filter*, *Sort* and
 * *Group* over their panels, then *Clear all* and the apply button, which waits for the sheet to
 * slide away.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const part = (name: string) =>
	createRawSnippet(() => ({ render: () => `<fieldset data-part="${name}"><legend>${name}</legend></fieldset>` }))

type Options = { shown?: number; label?: string; tab?: SheetTab; sort?: boolean; group?: boolean }

const show = (options: Options = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const calls: string[] = []
	mounted = mount(FilterSheet, {
		target: document.body,
		props: {
			heading: "Filter and sort",
			shown: options.shown ?? 5,
			label: options.label ?? "Show 5 results",
			...(options.tab ? { tab: options.tab } : {}),
			onclear: () => calls.push("clear"),
			onapply: () => calls.push("apply"),
			onclose: () => calls.push("close"),
			filterPart: part("filter"),
			...(options.sort === false ? {} : { sortPart: part("sort") }),
			...(options.group === false ? {} : { groupPart: part("group") }),
		},
	})
	flushSync()
	const root = document.body
	return {
		root,
		calls,
		click: (selector: string) => {
			root.querySelector<HTMLElement>(selector)?.click()
			flushSync()
		},
		key: (selector: string, key: string) => {
			root.querySelector<HTMLElement>(selector)?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
			flushSync()
		},
	}
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const tabs = (root: ParentNode) => [...root.querySelectorAll<HTMLButtonElement>("[role=tab]")]
const visible = (root: ParentNode) =>
	[...root.querySelectorAll<HTMLElement>("[role=tabpanel]")].filter((p) => !p.hidden).map((p) => p.dataset["tab"])

test("draws the heading, a tab per part and the footer", () => {
	const { root } = show()
	expect(text(root.querySelector("dialog h2"))).toBe("Filter and sort")
	const list = root.querySelector("[role=tablist]")
	expect(list?.classList.contains("filter-tabs")).toBe(true)
	expect(list?.getAttribute("aria-label")).toBe("Filter and sort")
	expect(tabs(root).map((t) => [t.dataset["tab"], text(t)])).toEqual([
		["filter", "Filter"],
		["sort", "Sort"],
		["group", "Group"],
	])
	const clear = root.querySelector(".filter-footer [data-action=clear]")
	expect(clear?.getAttribute("data-variant")).toBe("quiet")
	expect(text(clear)).toBe("Clear all")
	expect(text(root.querySelector(".filter-footer [data-action=apply]"))).toBe("Show 5 results")
})

test("opens on Filter by default, or on the tab asked for", () => {
	const { root } = show()
	expect(visible(root)).toEqual(["filter"])
	expect(tabs(root).map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"])
	expect(tabs(root).map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"])
	const sorted = show({ tab: "sort" })
	expect(visible(sorted.root)).toEqual(["sort"])
	expect(sorted.root.querySelector("[role=tabpanel][data-tab=sort] [data-part=sort]")).not.toBeNull()
})

test("each tab controls its panel, which it labels", () => {
	const { root } = show()
	for (const tab of tabs(root)) {
		const panel = root.querySelector(`#${tab.getAttribute("aria-controls")}`)
		expect(panel?.getAttribute("role")).toBe("tabpanel")
		expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id)
	}
})

test("a tab shows its panel and keeps the others in the page, hidden", () => {
	const { root, click } = show()
	click("[role=tab][data-tab=group]")
	expect(visible(root)).toEqual(["group"])
	expect(root.querySelector("[data-part=filter]")).not.toBeNull()
	expect(root.querySelector("[role=tab][data-tab=group]")?.getAttribute("aria-selected")).toBe("true")
})

test("arrow keys, Home and End move between tabs and take focus, wrapping", () => {
	const { root, key } = show()
	key("[role=tab][data-tab=filter]", "ArrowRight")
	expect(visible(root)).toEqual(["sort"])
	expect(document.activeElement?.getAttribute("data-tab")).toBe("sort")
	key("[role=tab][data-tab=sort]", "End")
	expect(visible(root)).toEqual(["group"])
	key("[role=tab][data-tab=group]", "ArrowRight")
	expect(visible(root)).toEqual(["filter"])
	key("[role=tab][data-tab=filter]", "ArrowLeft")
	expect(visible(root)).toEqual(["group"])
	key("[role=tab][data-tab=group]", "Home")
	expect(visible(root)).toEqual(["filter"])
})

test("a part left out has no tab; asking for it opens on Filter", () => {
	const { root } = show({ sort: false, tab: "sort" })
	expect(tabs(root).map((t) => t.dataset["tab"])).toEqual(["filter", "group"])
	expect(visible(root)).toEqual(["filter"])
})

test("Clear all asks the page and keeps the sheet open", () => {
	const { root, click, calls } = show()
	click("[data-action=clear]")
	expect(calls).toEqual(["clear"])
	expect(root.querySelector("dialog")?.hasAttribute("open")).toBe(true)
})

test("nothing to show disables the apply button", () => {
	const { root } = show({ shown: 0, label: "Nothing matches" })
	expect((root.querySelector("[data-action=apply]") as HTMLButtonElement).disabled).toBe(true)
})

test("apply waits for the sheet to slide away", async () => {
	const { root, click, calls } = show()
	let finish!: () => void
	const finished = new Promise<void>((resolve) => {
		finish = resolve
	})
	const dialog = root.querySelector("dialog") as HTMLDialogElement
	dialog.getAnimations = () => (dialog.hasAttribute("data-closing") ? [{ finished } as unknown as Animation] : [])
	click("[data-action=apply]")
	expect(calls).toEqual([])
	finish()
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(calls).toEqual(["apply"])
})

test("the tabs follow a switch of language", () => {
	const { root } = show()
	setLocale("th")
	flushSync()
	expect(text(tabs(root)[0])).not.toBe("Filter")
})
