import type { Card } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import TxFilter from "#components/organisms/TxFilter.svelte"
import { DEFAULT_TX_FILTER, type TxFilter as Filter, type TxSort } from "#lib/domain/transactions"
import { setLocale } from "#lib/i18n/index"

/**
 * The Transactions filter sheet: a draft of the filter and sort, counted live, that only the
 * apply button hands back. Ported from the legacy `cc-tx-filter` tests.
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

/** Lets the sheet's exit play (at most `EXIT_TIMEOUT_MS`) and whatever follows it run. */
const settle = async () => {
	await new Promise((resolve) => setTimeout(resolve, 450))
	flushSync()
}

type Props = {
	cards?: Card[]
	filter?: Filter
	sort?: TxSort
	count?: (filter: Filter, sort: TxSort) => number
}

const show = (props: Props = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const applied: { filter: Filter; sort: TxSort }[] = []
	let closed = 0
	mounted = mount(TxFilter, {
		target: document.body,
		props: {
			cards: props.cards ?? [card("A"), card("B")],
			filter: props.filter ?? DEFAULT_TX_FILTER,
			sort: props.sort ?? "new",
			count: props.count ?? ((f: Filter) => f.types.length + f.cards.length + (f.range ? 1 : 0) + 5),
			onapply: (detail: { filter: Filter; sort: TxSort }) => applied.push(detail),
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
		type: (selector: string, value: string) => {
			const input = root.querySelector<HTMLInputElement>(selector)
			if (!input) throw new Error(`no ${selector}`)
			input.value = value
			input.dispatchEvent(new Event("input", { bubbles: true }))
			flushSync()
		},
	}
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("sits in a sheet with the apply button counting results", () => {
	const { root, click } = show()
	expect(root.querySelector("dialog")?.hasAttribute("open")).toBe(true)
	expect(text(root.querySelector("dialog h2"))).toBe("Filter and sort")
	expect(text(root.querySelector("[data-action=apply]"))).toBe("Show 5 results")
	click("[data-type=purchase]")
	expect(text(root.querySelector("[data-action=apply]"))).toBe("Show 6 results")
})

test("groups its chips in fieldsets: type, card, date and sort", () => {
	const { root } = show()
	expect(root.querySelectorAll("fieldset")).toHaveLength(4)
	expect(root.querySelectorAll("fieldset > legend")).toHaveLength(4)
	const chip = root.querySelector("[data-type=purchase]")
	expect(chip?.getAttribute("type")).toBe("button")
	expect(chip?.getAttribute("data-variant")).toBe("quiet")
	expect(chip?.getAttribute("aria-pressed")).toBe("false")
})

test("one result reads singular and none disables the button", () => {
	const one = show({ count: () => 1 })
	expect(text(one.root.querySelector("[data-action=apply]"))).toBe("Show 1 result")
	const none = show({ count: () => 0 })
	const apply = none.root.querySelector("[data-action=apply]") as HTMLButtonElement
	expect(text(apply)).toBe("Nothing matches")
	expect(apply.disabled).toBe(true)
})

test("apply hands back the draft filter and sort", async () => {
	const { root, click, applied } = show()
	click("[data-type=payment]")
	click("[data-card=B]")
	click("[data-range=week]")
	click("[data-sort=big]")
	expect(root.querySelector("[data-sort=big]")?.getAttribute("aria-pressed")).toBe("true")
	click("[data-action=apply]")
	await settle()
	expect(applied).toHaveLength(1)
	expect(applied[0]?.filter.types).toEqual(["payment"])
	expect(applied[0]?.filter.cards).toEqual(["B"])
	expect(applied[0]?.filter.range).toBe("week")
	expect(applied[0]?.sort).toBe("big")
})

test("types and cards toggle off again; the search text is kept", async () => {
	const { click, applied } = show({ filter: { ...DEFAULT_TX_FILTER, q: "abc", cards: ["A"] } })
	click("[data-card=A]")
	click("[data-action=apply]")
	await settle()
	expect(applied[0]?.filter.cards).toEqual([])
	expect(applied[0]?.filter.q).toBe("abc")
})

test("the draft starts from the filter and leaves it untouched", () => {
	const filter: Filter = { ...DEFAULT_TX_FILTER, types: ["purchase"] }
	const { root, click } = show({ filter, sort: "old" })
	expect(root.querySelector("[data-type=purchase]")?.getAttribute("aria-pressed")).toBe("true")
	expect(root.querySelector("[data-sort=old]")?.getAttribute("aria-pressed")).toBe("true")
	click("[data-type=payment]")
	expect(filter).toEqual({ ...DEFAULT_TX_FILTER, types: ["purchase"] })
})

test("a custom range shows from and to", async () => {
	const { root, click, type, applied } = show()
	expect(root.querySelector("input[name=from]")).toBeNull()
	click("[data-range=custom]")
	expect(root.querySelector("input[name=to]")).not.toBeNull()
	type("input[name=from]", "2026-10-01")
	click("[data-action=apply]")
	await settle()
	expect(applied[0]?.filter.range).toBe("custom")
	expect(applied[0]?.filter.from).toBe("2026-10-01")
})

test("a chosen range taps off again", () => {
	const { root, click } = show()
	click("[data-range=week]")
	expect(root.querySelector("[data-range=week]")?.getAttribute("aria-pressed")).toBe("true")
	click("[data-range=week]")
	expect(root.querySelector("[data-range=week]")?.getAttribute("aria-pressed")).toBe("false")
})

test("Clear all resets the draft but keeps the sheet open", () => {
	const { root, click } = show({
		filter: { ...DEFAULT_TX_FILTER, types: ["payment"], range: "month" },
		sort: "old",
	})
	click("[data-action=clear]")
	expect(root.querySelector("dialog")?.hasAttribute("open")).toBe(true)
	expect(root.querySelector("[data-type=payment]")?.getAttribute("aria-pressed")).toBe("false")
	expect(root.querySelector("[data-range=month]")?.getAttribute("aria-pressed")).toBe("false")
	expect(root.querySelector("[data-sort=new]")?.getAttribute("aria-pressed")).toBe("true")
	expect(root.querySelector("[data-sort=old]")?.getAttribute("aria-pressed")).toBe("false")
})

test("Close calls onclose and applies nothing", async () => {
	const { click, closed, applied } = show()
	click("[data-action=close]")
	await settle()
	expect(closed()).toBe(1)
	expect(applied).toEqual([])
})

test("leaving custom clears the typed from and to", async () => {
	const { click, type, applied } = show()
	click("[data-range=custom]")
	type("input[name=from]", "2026-10-01")
	click("[data-range=month]")
	click("[data-action=apply]")
	await settle()
	expect(applied[0]?.filter.range).toBe("month")
	expect(applied[0]?.filter.from).toBe("")
	expect(applied[0]?.filter.to).toBe("")
})

test("card choices are in the line form, and there are four sorts", () => {
	const { root } = show()
	expect(text(root.querySelector("[data-card=A]"))).toBe("A) Card A (1111)")
	expect(root.querySelectorAll("[data-sort]")).toHaveLength(4)
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

test("the copy follows a switch of language", () => {
	const { root } = show()
	setLocale("th")
	flushSync()
	expect(text(root.querySelector("dialog h2"))).not.toBe("Filter and sort")
})

test("many cards fold under a find box, and a card unpicked past the fold stays", () => {
	const cards = Array.from({ length: 12 }, (_, i) => card(String(i + 1)))
	const { root, click } = show({ cards, filter: { ...DEFAULT_TX_FILTER, cards: ["11"] } })
	const chips = () => [...root.querySelectorAll("[data-card]")].map((el) => el.getAttribute("data-card"))
	expect(root.querySelector("input[name=cardq]")).not.toBeNull()
	expect(chips()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "11"])
	click("[data-card='11']")
	expect(root.querySelector("[data-card='11']")?.getAttribute("aria-pressed")).toBe("false")
	click("[data-action=more-cards]")
	expect(chips()).toHaveLength(12)
})
