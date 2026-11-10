import type { ReadySort } from "#lib/domain/home"
import type { Owner } from "#lib/domain/owner"
import type { SortDir } from "#lib/domain/sort"
import type { LocationRecord } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import ReadyFilter from "#components/organisms/ReadyFilter.svelte"
import { DEFAULT_READY_FILTER, type ReadyFilter as Filter, type ReadyGroup } from "#lib/domain/ready-filter"
import { setLocale } from "#lib/i18n/index"

/**
 * The new-list picker's filter sheet: a draft of the filter and sort, counted live, that only
 * the apply button hands back. Ported from the legacy `cc-ready-filter` tests.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

/** Lets the sheet's exit play (at most `EXIT_TIMEOUT_MS`) and whatever follows it run. */
const settle = async () => {
	await new Promise((resolve) => setTimeout(resolve, 450))
	flushSync()
}

type Props = {
	locations?: string[]
	records?: LocationRecord[]
	owners?: Owner[]
	filter?: Filter
	sort?: ReadySort
	dir?: SortDir
	by?: ReadyGroup
	count?: (filter: Filter) => number
}

const show = (props: Props = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const applied: { filter: Filter; sort: ReadySort; dir: SortDir; by: ReadyGroup }[] = []
	let closed = 0
	mounted = mount(ReadyFilter, {
		target: document.body,
		props: {
			locations: props.locations ?? ["bangkok", "krabi"],
			records: props.records ?? [
				{ id: "krabi", name: "Krabi", takesPurchases: true },
				{ id: "bangkok", name: "Bangkok", takesPurchases: false },
			],
			owners: props.owners ?? ["KC", "NT"],
			filter: props.filter ?? DEFAULT_READY_FILTER,
			sort: props.sort ?? "room",
			dir: props.dir ?? "desc",
			by: props.by ?? "none",
			count: props.count ?? ((f: Filter) => 5 - f.locations.length - f.owners.length),
			onapply: (detail: { filter: Filter; sort: ReadySort; dir: SortDir; by: ReadyGroup }) => applied.push(detail),
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

const text = (root: ParentNode, selector: string) =>
	root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim()

const texts = (root: ParentNode, selector: string) =>
	[...root.querySelectorAll(selector)].map((el) => el.textContent?.replace(/\s+/g, " ").trim())

test("a sheet of Kept in, Account holder and Sort, counting cards", () => {
	const { root } = show()
	expect(root.querySelector("dialog")?.hasAttribute("open")).toBe(true)
	expect(text(root, "dialog h2")).toBe("Filter and sort")
	expect(root.querySelectorAll("fieldset > legend")).toHaveLength(4)
	expect(texts(root, "legend")).toEqual(["Kept in", "Account holder", "Sort", "Group by"])
	expect(texts(root, "[data-by]")).toEqual(["None", "Place", "Account holder"])
	expect(texts(root, "[data-location]")).toEqual(["Bangkok", "Krabi"])
	expect(texts(root, "[data-owner]")).toEqual(["KC", "NT"])
	expect(texts(root, "[data-sort]")).toEqual(["Room", "Close date", "Due date"])
	expect(root.querySelector("[data-sort=room]")?.getAttribute("aria-pressed")).toBe("true")
	expect(texts(root, "[data-dir]")).toEqual(["↓ Most", "↑ Least"])
	expect(text(root, "[data-action=apply]")).toBe("Show 5 cards")
	const chip = root.querySelector("[data-location=krabi]")
	expect(chip?.getAttribute("type")).toBe("button")
	expect(chip?.getAttribute("data-variant")).toBe("quiet")
	expect(chip?.getAttribute("aria-pressed")).toBe("false")
})

test("places are named by their records, in the reader's language", () => {
	const { root } = show({
		locations: ["chiang-mai", "krabi"],
		records: [
			{ id: "krabi", name: "Krabi", takesPurchases: true },
			{ id: "chiang-mai", name: "Chiang Mai", takesPurchases: true },
		],
	})
	expect(texts(root, "[data-location]")).toEqual(["Chiang Mai", "Krabi"])
	setLocale("th")
	flushSync()
	expect(texts(root, "[data-location]")).toEqual(["Chiang Mai", "กระบี่"])
})

test("picks count live and only apply hands them back", async () => {
	const { root, click, applied } = show()
	click("[data-location=krabi]")
	click("[data-owner=NT]")
	click("[data-sort=due]")
	click("[data-dir=asc]")
	click("[data-by=place]")
	expect(root.querySelector("[data-location=krabi]")?.getAttribute("aria-pressed")).toBe("true")
	expect(text(root, "[data-action=apply]")).toBe("Show 3 cards")
	expect(applied).toEqual([])
	click("[data-action=apply]")
	await settle()
	expect(applied).toEqual([
		{ filter: { q: "", locations: ["krabi"], owners: ["NT"] }, sort: "due", dir: "asc", by: "place" },
	])
})

test("a picked chip taps off again", () => {
	const { root, click } = show()
	click("[data-owner=KC]")
	expect(root.querySelector("[data-owner=KC]")?.getAttribute("aria-pressed")).toBe("true")
	click("[data-owner=KC]")
	expect(root.querySelector("[data-owner=KC]")?.getAttribute("aria-pressed")).toBe("false")
})

test("Clear all keeps the search, and one or no card reads right", async () => {
	const { root, click, applied } = show({
		filter: { q: "scb", locations: ["krabi"], owners: [] },
		sort: "close",
		dir: "asc",
		by: "holder",
	})
	click("[data-action=clear]")
	expect(root.querySelector("dialog")?.hasAttribute("open")).toBe(true)
	expect(root.querySelector("[data-sort=room]")?.getAttribute("aria-pressed")).toBe("true")
	click("[data-action=apply]")
	await settle()
	expect(applied).toEqual([{ filter: { q: "scb", locations: [], owners: [] }, sort: "room", dir: "desc", by: "none" }])
	const one = show({ count: () => 1 })
	expect(text(one.root, "[data-action=apply]")).toBe("Show 1 card")
	const none = show({ count: () => 0 })
	const apply = none.root.querySelector<HTMLButtonElement>("[data-action=apply]")
	expect(apply?.disabled).toBe(true)
	expect(apply?.textContent?.trim()).toBe("Nothing matches")
})

test("the draft starts from the filter and leaves it untouched", () => {
	const filter: Filter = { q: "", locations: ["krabi"], owners: [] }
	const { root, click } = show({ filter, sort: "due" })
	expect(root.querySelector("[data-location=krabi]")?.getAttribute("aria-pressed")).toBe("true")
	expect(root.querySelector("[data-sort=due]")?.getAttribute("aria-pressed")).toBe("true")
	click("[data-location=bangkok]")
	expect(filter).toEqual({ q: "", locations: ["krabi"], owners: [] })
})

test("a group with no choice is left out", () => {
	const { root } = show({ owners: [] })
	expect(texts(root, "legend")).toEqual(["Kept in", "Sort", "Group by"])
	const bare = show({ locations: [], owners: [] })
	expect(texts(bare.root, "legend")).toEqual(["Sort", "Group by"])
})

test("reads in Thai", () => {
	setLocale("th")
	const { root } = show()
	expect(texts(root, "legend")).toEqual(["สถานที่", "เจ้าของบัตร", "เรียงตาม", "จัดกลุ่มตาม"])
	expect(text(root, "[data-action=apply]")).toBe("แสดง 5 ใบ")
})

test("Close calls onclose and applies nothing", async () => {
	const { click, closed, applied } = show()
	click("[data-action=close]")
	await settle()
	expect(closed()).toBe(1)
	expect(applied).toEqual([])
})

test("apply waits for the sheet to slide away before it is handed back", async () => {
	const { root, click, applied } = show()
	let finish!: () => void
	const finished = new Promise<void>((resolve) => {
		finish = resolve
	})
	const dialog = root.querySelector("dialog") as HTMLDialogElement
	dialog.getAnimations = () => (dialog.hasAttribute("data-closing") ? [{ finished } as unknown as Animation] : [])
	click("[data-action=apply]")
	expect(dialog.hasAttribute("data-closing")).toBe(true)
	expect(applied).toHaveLength(0)
	finish()
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(applied).toHaveLength(1)
})
