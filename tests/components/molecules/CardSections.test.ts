import type { Sectioned } from "#lib/domain/cards-view"
import type { Card } from "#lib/domain/types"

import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import CardSections from "#components/molecules/CardSections.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * A list of cards in Cards' sections (DD-192), shared by Cards, Home's _Owed_ and _Ready to use_:
 * a head per section with its count, or one flat grid under an optional line.
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

const tile = createRawSnippet((item: () => Card, unplaced: () => boolean) => ({
	render: () => `<a data-card="${item().id}" data-unplaced="${unplaced()}">${item().id}</a>`,
}))

const show = (results: Sectioned<Card>, head?: string) => {
	mounted = mount(CardSections<Card>, {
		target: document.body,
		props: {
			results,
			cardOf: (c: Card) => c,
			locations: [{ id: "krabi", name: "Krabi", takesPurchases: true }],
			head,
			tile,
		},
	})
	flushSync()
	return document.body
}

const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("a section per place, headed by its name, its count and that it takes purchases", () => {
	const root = show({
		sections: [{ key: "place:krabi", kind: "place", location: "krabi", cards: [card("A"), card("B")] }],
		flat: null,
		count: 2,
	})
	const section = root.querySelector('section[data-section="place:krabi"]')
	expect(section?.getAttribute("data-location")).toBe("krabi")
	expect(flat(section?.querySelector("h2"))).toBe("Krabi 2 cards · takes purchases")
	expect([...root.querySelectorAll(".tiles a")].map((a) => [a.textContent, a.getAttribute("data-unplaced")])).toEqual([
		["A", "false"],
		["B", "false"],
	])
})

test("holders and limit groups head their sections by name (every card has both, RD-27)", () => {
	const root = show({
		sections: [
			{ key: "holder:KC", kind: "holder", owner: "KC", cards: [card("A")] },
			{
				key: "limit:g",
				kind: "limit",
				group: { id: "g", name: "SCB Pool", limit: 100_00, owner: "KC" },
				cards: [card("B")],
			},
		],
		flat: null,
		count: 2,
	})
	expect([...root.querySelectorAll("section h2")].map(flat)).toEqual(["KC 1 card", "SCB Pool 1 card"])
	expect(root.querySelector('[data-card="A"]')?.getAttribute("data-unplaced")).toBe("true")
})

test("flat: the line over the grid when given, else the grid alone", () => {
	const withHead = show({ sections: null, flat: [card("A")], count: 1 }, "1 card")
	expect(flat(withHead.querySelector("section .result-head"))).toBe("1 card")
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const bare = show({ sections: null, flat: [card("A")], count: 1 })
	expect(bare.querySelector("section")).toBeNull()
	expect(bare.querySelectorAll(".tiles a")).toHaveLength(1)
})

test("the tiles fill the width: one column on a phone, as many as fit from 900px", async () => {
	const source = await Bun.file("src/components/molecules/CardSections.svelte").text()
	expect(source).toMatch(/\.tiles\s*\{[^}]*display: grid/)
	expect(source).toMatch(
		/@media \(min-width: 900px\)\s*\{\s*\.tiles\s*\{\s*grid-template-columns: repeat\(auto-fill, minmax\(var\(--cc-tile-min\), 1fr\)\)/,
	)
})
