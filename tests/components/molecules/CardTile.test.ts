import type { GroupRoom } from "#lib/domain/room"
import type { Card, LimitGroup } from "#lib/domain/types"

import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import CardTile from "#components/molecules/CardTile.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * One card tile (DD-151): `id) name` and its corner, the group's room and its word or the
 * picker's figure, the aside, the facts, and a rail in the group's use. The Cards page, Home's
 * *Ready to use* and the pickers fill it each their own way.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const card: Card = {
	id: "A",
	name: "Card A",
	last4: "1111",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g1",
}
const g1: LimitGroup = { id: "g1", name: "SCB", limit: 100_000_00, owner: "KC", color: "blue" }
const room = (used: number, held = 0): GroupRoom => ({
	group: g1,
	used,
	available: g1.limit - used,
	held,
	room: g1.limit - used - held,
	level: "within",
	sharedWith: 0,
})

const show = (props: Record<string, unknown>) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(CardTile, {
		target: document.body,
		props: { card, room: room(20_000_00), credit: 0, corner: "•••• 1111", ...props } as never,
	})
	flushSync()
	return document.body.querySelector(".tile") as HTMLElement
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("with an href it is a link in its tone, carrying the card's id", () => {
	const tile = show({ href: "/card?id=A", tone: "blue", mono: true })
	expect(tile.tagName).toBe("A")
	expect(tile.getAttribute("href")).toBe("/card?id=A")
	expect(tile.dataset["g"]).toBe("blue")
	expect(tile.dataset["card"]).toBe("A")
	expect(tile.querySelector(".corner")?.hasAttribute("data-mono")).toBe(true)
	expect(text(tile.querySelector(".name"))).toBe("A) Card A")
})

test("without one it is a toggle button with the lead before the name", () => {
	let clicks = 0
	const tile = show({
		pressed: true,
		label: "Pick Card A",
		lead: createRawSnippet(() => ({ render: () => `<span class="tick" aria-hidden="true"></span>` })),
		onclick: () => {
			clicks += 1
		},
	})
	expect(tile.tagName).toBe("BUTTON")
	expect(tile.getAttribute("type")).toBe("button")
	expect(tile.getAttribute("aria-pressed")).toBe("true")
	expect(tile.getAttribute("aria-label")).toBe("Pick Card A")
	expect(tile.hasAttribute("data-g")).toBe(false)
	expect(tile.querySelector(".corner")?.hasAttribute("data-mono")).toBe(false)
	expect(tile.querySelector(".name > .tick + .label")).not.toBeNull()
	tile.click()
	expect(clicks).toBe(1)
})

test("line 2: the room and its word, the aside in its tone, then the facts; the rail tells the use", () => {
	const tile = show({ aside: "Due soon", asideTone: "warn", facts: "closes 18 Nov" })
	expect(text(tile.querySelector(".room"))).toBe("฿80,000.00 room")
	expect(tile.querySelector(".aside")?.getAttribute("data-tone")).toBe("warn")
	expect(text(tile.querySelector(".facts"))).toBe("closes 18 Nov")
	const rail = tile.querySelector<HTMLElement>(".rail")
	expect(rail?.dataset["level"]).toBe("within")
	expect(rail?.getAttribute("role")).toBe("img")
	expect(rail?.getAttribute("aria-label")).toMatch(/20/)
	expect(rail?.querySelector<HTMLElement>("span")?.style.inlineSize).toBe("20%")
})

test("no aside, no facts: neither line is drawn", () => {
	const tile = show({})
	expect(tile.querySelector(".aside")).toBeNull()
	expect(tile.querySelector(".facts")).toBeNull()
})

test("plain room drops the word *room*, but credit and use still show", () => {
	expect(text(show({ plainRoom: true }).querySelector(".room"))).toBe("฿80,000.00")
	expect(text(show({ plainRoom: true, credit: 250_00 }).querySelector(".room"))).toBe("฿80,000.00 credit ฿250.00")
	expect(text(show({ plainRoom: true, room: room(90_000_00) }).querySelector(".room"))).toBe("฿10,000.00 90% used")
})

test("quiet over: past the limit the amount turns red with no word under it", () => {
	const loud = show({ room: room(120_000_00) })
	expect(text(loud.querySelector(".room small"))).toBe("over limit")
	expect(loud.querySelector(".room")?.hasAttribute("data-tone")).toBe(false)
	const quiet = show({ room: room(120_000_00), quietOver: true })
	expect(quiet.querySelector(".room small")).toBeNull()
	expect(quiet.querySelector(".room")?.getAttribute("data-tone")).toBe("bad")
	expect(quiet.querySelector<HTMLElement>(".rail")?.dataset["level"]).toBe("over")
})

test("a figure takes line 2 in place of the room; the rail still follows the room", () => {
	const tile = show({ figure: { amount: "฿1,000.00", word: "owed" } })
	expect(text(tile.querySelector(".room"))).toBe("฿1,000.00 owed")
	expect(tile.querySelector(".rail")).not.toBeNull()
	const bare = show({ room: null, figure: { word: "nothing owed" } })
	expect(bare.querySelector(".room b")).toBeNull()
	expect(text(bare.querySelector(".room"))).toBe("nothing owed")
	expect(bare.querySelector(".rail")).toBeNull()
})

test("no room and no figure: line 2 says nothing about a group, and there is no rail (RD-27)", () => {
	const tile = show({ room: null })
	expect(tile.querySelector(".room")).toBeNull()
	expect(text(tile)).not.toContain("No limit group")
	expect(tile.querySelector(".rail")).toBeNull()
})

test("a language switch re-renders the words in place", () => {
	const tile = show({})
	const english = text(tile.querySelector(".room"))
	setLocale("th")
	flushSync()
	expect(document.body.querySelector(".tile")).toBe(tile)
	expect(text(tile.querySelector(".room"))).not.toBe(english)
})

// DD-151, DD-166: a card tile hovers by deepening its edge in its own colour, never an
// underline, and keeps its focus ring.
test("a tile hovers without an underline and keeps a focus ring", async () => {
	const style = (await Bun.file("src/components/molecules/CardTile.svelte").text()).split("<style>")[1] ?? ""
	const hover = style.match(/\.tile:hover\s*\{([^}]*)\}/)?.[1] ?? ""
	expect(hover).toContain("text-decoration: none")
	expect(hover).toContain("border-color")
	expect(style).toMatch(/\.tile:focus-visible\s*\{[^}]*box-shadow: var\(--cc-focus-ring\)/)
})

test("a foot adds a last line under the facts, across the tile", () => {
	const tile = show({
		facts: "closes 18 Nov · due 3 Dec",
		foot: createRawSnippet(() => ({ render: () => `<span class="usage">฿12,000.00 in 12 statements</span>` })),
	})
	const foot = tile.querySelector(".foot")
	expect(text(foot)).toBe("฿12,000.00 in 12 statements")
	expect(tile.querySelector(".facts + .foot")).toBe(foot)
	expect(show({}).querySelector(".foot")).toBeNull()
})
