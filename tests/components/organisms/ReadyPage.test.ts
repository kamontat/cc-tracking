import type { Card } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import ReadyPage from "#components/organisms/ReadyPage.svelte"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { fakeHistory } from "../../lib/ui/fake-history"
import { saveLocations } from "./list-support"

/**
 * Home's _Ready to use_ tab (`/ready`, RD-22): every ready card, narrowed, ordered and grouped as kept
 * in the address (`q`, `f.locations`, `f.owners`, `sort`, `dir`, `by`), each tile opening the card's panel over the tab (`?card=`).
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const settle = async (rounds = 20) => {
	for (let i = 0; i < rounds; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

const card = (id: string, closeDay: number, group = "g1", extra: Partial<Card> = {}): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: group,
	...extra,
})

const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 })
	await repo.saveLimitGroup({ id: "g2", name: "G2", limit: 50_000_00 })
	await saveLocations(repo, ["krabi"])
	// Five ready cards, more than Home's old short panel showed.
	await repo.saveCard(card("1", 5))
	await repo.saveCard(card("2", 10))
	await repo.saveCard(card("3", 15, "g2"))
	await repo.saveCard(card("4", 20, "g2"))
	await repo.saveCard(card("5", 28, "g2"))
	await repo.saveCard(card("9", 5, "g1", { archived: true }))
}

const open = async (search = "", more?: (repo: Repository) => Promise<void>) => {
	const repo = new InMemoryRepository()
	await seed(repo)
	await more?.(repo)
	const history = fakeHistory(`/ready${search}`)
	mounted = mount(ReadyPage, {
		target: document.body,
		props: {
			open: async () => ({ ok: true as const, repo }),
			clock: () => new Date("2026-10-31T03:00:00Z"),
			address: history.bar,
		},
	})
	await settle()
	return { repo, history }
}

const press = async (el: Element | null | undefined) => {
	if (!el) throw new Error("nothing to press")
	;(el as HTMLElement).click()
	await settle()
}

const tiles = () => [...document.querySelectorAll("#ready-list [data-card]")].map((el) => el.getAttribute("data-card"))

test("every ready card by place, most room first, with no See more", async () => {
	await open()
	expect(tiles()).toEqual(["1", "2", "3", "4", "5"])
	expect(text($('.ready section[data-section="place:krabi"] h2'))).toBe("Krabi 5 cards · takes purchases")
	expect($('[data-action="more"]')).toBeNull()
})

test("a card in no stored group is left out, and nothing counts it or links to assign it (RD-27)", async () => {
	await open("", async (repo) => {
		const { limitGroupId: _, ...loose } = card("7", 5)
		await repo.saveCard(loose)
		await repo.saveCard(card("8", 5, "gone"))
	})
	expect(tiles()).toEqual(["1", "2", "3", "4", "5"])
	expect(document.body.textContent).not.toContain("no limit group")
	expect($('a[href^="/cards?ungrouped"]')).toBeNull()
	expect($('[data-testid="unassigned"]')).toBeNull()
})

const sortChip = () => $<HTMLButtonElement>(".ready-main > .tx-controls > .tx-chips > button.tx-chip.tx-sort")

/** Opens the sort sheet from the chip, picks a field (or keeps it) and a way, and applies. */
const sortBy = async (field: string | null, dir: string | null) => {
	await press(sortChip())
	if (field) await press($(`dialog [data-sort="${field}"]`))
	if (dir) await press($(`dialog [data-dir="${dir}"]`))
	await press($("dialog [data-action=apply]"))
}

test("the control row is Cards': search, Filter, then the sort and group chips", async () => {
	await open()
	expect($<HTMLInputElement>(".ready-main > .tx-controls input.search")?.placeholder).toBe(
		"Name, ID, last 4 or comment",
	)
	expect(text($('.tx-controls [data-action="filter"]'))).toBe("Filter")
	expect(text(sortChip())).toBe("Sort: Most room ▾")
	expect(text($('.tx-chips [data-action="group"]'))).toBe("Group: Place ▾")
	expect($(".ready-main > .tx-controls + .ready")).not.toBeNull()
})

test("the order comes from the address, and a new one is written in place", async () => {
	const { history } = await open("?sort=close")
	// Longest to close first: the 28th closes last, the 5th first.
	expect(tiles()).toEqual(["5", "4", "3", "2", "1"])
	await sortBy("room", null)
	expect(history.now()).toBe("/ready")
	await sortBy(null, "asc")
	expect(history.now()).toBe("/ready?dir=asc")
	expect(history.size()).toBe(1)
	expect(tiles()).toEqual(["3", "4", "5", "1", "2"])
})

test("Filter opens Cards' sheet, with no bill states; filters and grouping go in the address", async () => {
	const { history } = await open()
	await press($('.tx-controls [data-action="filter"]'))
	expect(text($("dialog h2"))).toBe("Filter ready cards")
	expect(document.querySelector("dialog [data-state]")).toBeNull()
	await press($('dialog [data-owner="RI"]'))
	expect($<HTMLButtonElement>("dialog [data-action=apply]")?.disabled).toBe(true)
	await press($('dialog [data-owner="RI"]'))
	await press($('dialog [data-by="limit"]'))
	await press($("dialog [data-action=apply]"))
	expect(history.now()).toBe("/ready?by=limit")
	expect(
		[...document.querySelectorAll(".ready section[data-section]")].map((el) => el.getAttribute("data-section")),
	).toEqual(["limit:g1", "limit:g2"])
	expect(text($('.ready section[data-section="limit:g2"] h2'))).toBe("G2 3 cards")
})

test("not grouped, the head counts the cards and their places; a search that finds nothing says so", async () => {
	const { history } = await open("?by=none")
	expect(text($(".ready .result-head"))).toBe("5 cards in Krabi")
	const box = $<HTMLInputElement>(".tx-controls input.search")
	if (!box) throw new Error("no search")
	box.value = "zzz"
	box.dispatchEvent(new Event("input"))
	await settle()
	expect(history.now()).toBe("/ready?q=zzz&by=none")
	expect(text($(".ready .empty"))).toBe("No card matches. Clear the search or a filter.")
})

test("a tile opens the card's panel over the tab, pushing ?card=; Back closes it", async () => {
	const { history } = await open("?dir=asc")
	await press($('#ready-list [data-card="2"]'))
	expect(history.now()).toBe("/ready?dir=asc&card=2")
	expect(history.size()).toBe(2)
	expect($(".detail-panel .card-hero")).not.toBeNull()
	expect($('#ready-list [data-card="2"]')?.getAttribute("aria-current")).toBe("true")
	history.userBack()
	await settle()
	expect($(".detail-panel")).toBeNull()
})

test("a pasted ?card= opens the panel at once, an archived card's too", async () => {
	await open("?card=9")
	expect($(".detail-panel .card-hero")).not.toBeNull()
})

test("names the places in the reader's language", async () => {
	await open("?by=none")
	setLocale("th")
	await settle()
	expect(text($(".ready .result-head"))).toContain("กระบี่")
})
