import type { CardsGlance as Glance } from "#lib/domain/cards-glance"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import CardsGlance from "#components/molecules/CardsGlance.svelte"
import { setLocale } from "#lib/i18n/index"

/** The Cards tab's glance panels: the shown cards' count, what they owe, what is due in 7 days, and the used share. */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const show = (glance: Glance) => {
	mounted = mount(CardsGlance, { target: document.body, props: { glance } })
	flushSync()
	return document.body
}

const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const panels = (root: HTMLElement) =>
	[...root.querySelectorAll(".cards-glance > [data-field]")].map((el) => [el.getAttribute("data-field"), flat(el)])

test("four panels, each a label over its figure; due in 7 days says how many cards", () => {
	const root = show({ count: 4, owed: 123_456_78, soon: { count: 1, amount: 2_000_00 }, usedPct: 23 })
	expect(root.querySelector(".cards-glance")?.getAttribute("aria-label")).toBe("At a glance")
	expect(panels(root)).toEqual([
		["count", "Cards 4"],
		["owed", "Owed ฿123,456.78"],
		["soon", "Due in 7 days ฿2,000.00 1 card"],
		["used", "Used of limit 23%"],
	])
	expect(root.querySelector('[data-field="owed"] b')?.hasAttribute("data-numeric")).toBe(true)
})

test("no used share reads as a dash; the panels follow the language", () => {
	setLocale("th")
	const root = show({ count: 0, owed: 0, soon: { count: 0, amount: 0 }, usedPct: null })
	expect(flat(root.querySelector('[data-field="used"] b'))).toBe("—")
	expect(flat(root.querySelector('[data-field="count"] small'))).toBe("บัตร")
})
