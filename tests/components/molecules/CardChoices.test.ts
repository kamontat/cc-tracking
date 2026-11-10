import type { Card } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import CardChoices from "#components/molecules/CardChoices.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The filter sheets' *Card* section: a chip per card, and past eight cards a find box and a
 * fold, so a long list of cards does not make the sheet long.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const card = (id: string, name = `Card ${id}`): Card => ({
	id,
	name,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
})

const many = (n: number) => Array.from({ length: n }, (_, i) => card(String(i + 1)))

const show = (cards: Card[], selected: string[] = []) => {
	const toggled: string[] = []
	mounted = mount(CardChoices, {
		target: document.body,
		props: { legend: "Card", cards, selected, ontoggle: (id: string) => toggled.push(id) },
	})
	flushSync()
	const root = document.body
	return {
		root,
		toggled,
		chips: () => [...root.querySelectorAll("[data-card]")].map((el) => el.getAttribute("data-card")),
		click: (selector: string) => {
			const target = root.querySelector<HTMLElement>(selector)
			if (!target) throw new Error(`no ${selector}`)
			target.click()
			flushSync()
		},
		find: (value: string) => {
			const input = root.querySelector<HTMLInputElement>("input[name=cardq]")
			if (!input) throw new Error("no find box")
			input.value = value
			input.dispatchEvent(new Event("input", { bubbles: true }))
			flushSync()
		},
	}
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("a few cards are all chips under the legend, with no find box or fold", () => {
	const { root, chips } = show(many(3))
	expect(text(root.querySelector("fieldset > legend"))).toBe("Card")
	expect(chips()).toEqual(["1", "2", "3"])
	expect(text(root.querySelector("[data-card='1']"))).toBe("1) Card 1 (1111)")
	expect(root.querySelector("input[name=cardq]")).toBeNull()
	expect(root.querySelector("[data-action=more-cards]")).toBeNull()
})

test("a chip toggles its card and says whether it is picked", () => {
	const { root, click, toggled } = show(many(3), ["2"])
	expect(root.querySelector("[data-card='2']")?.getAttribute("aria-pressed")).toBe("true")
	expect(root.querySelector("[data-card='1']")?.getAttribute("aria-pressed")).toBe("false")
	click("[data-card='1']")
	expect(toggled).toEqual(["1"])
})

test("many cards fold after eight, with a find box and Show all", () => {
	const { root, chips, click } = show(many(12))
	expect(root.querySelector("input[name=cardq]")).not.toBeNull()
	expect(chips()).toHaveLength(8)
	const more = root.querySelector("[data-action=more-cards]")
	expect(text(more)).toBe("Show all 12 cards")
	expect(more?.getAttribute("data-variant")).toBe("quiet")
	click("[data-action=more-cards]")
	expect(chips()).toHaveLength(12)
	expect(text(root.querySelector("[data-action=more-cards]"))).toBe("Show fewer")
	click("[data-action=more-cards]")
	expect(chips()).toHaveLength(8)
})

test("a card picked past the fold shows", () => {
	const { chips } = show(many(12), ["11"])
	expect(chips()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "11"])
})

test("the find box narrows the chips and says when nothing matches", () => {
	const { root, chips, find } = show([...many(10), card("K", "Krungsri Gold")])
	find("krung")
	expect(chips()).toEqual(["K"])
	expect(root.querySelector("[data-action=more-cards]")).toBeNull()
	find("zzz")
	expect(chips()).toEqual([])
	expect(text(root.querySelector(".filter-none"))).toBe("No card matches")
})

test("a card found and picked stays once the find is cleared", () => {
	const { chips, find, click } = show(many(12))
	find("12")
	click("[data-card='12']")
	find("")
	expect(chips()).toContain("12")
})

test("the copy follows a switch of language", () => {
	const { root } = show(many(12))
	setLocale("th")
	flushSync()
	expect(text(root.querySelector("[data-action=more-cards]"))).not.toBe("Show all 12 cards")
})
