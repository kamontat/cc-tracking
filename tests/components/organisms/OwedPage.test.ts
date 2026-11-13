import type { Card } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import OwedPage from "#components/organisms/OwedPage.svelte"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { fakeHistory } from "../../lib/ui/fake-history"
import { saveLocations } from "./list-support"

/**
 * Home's _Owed_ tab (`/owed`, RD-25): only the cards that owe, in the order kept in the address
 * (`sort`, `dir`), each tile opening the card's panel over the tab (`?card=`), and _Pay_ opening
 * it straight on the pay form with what is left filled in.
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

const card = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
})

const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 })
	for (const id of ["7", "12.3", "20"]) await repo.saveCard(card(id))
	await saveLocations(repo, ["krabi"])
	// 7: a bill overdue since early October; 12.3: a bill due in November; 20 owes nothing.
	await repo.savePurchase({ id: "p1", cardId: "7", date: "2026-09-10", amount: 1_000_00, note: "" })
	await repo.savePurchase({ id: "p2", cardId: "12.3", date: "2026-10-10", amount: 5_000_00, note: "" })
	await repo.saveCardPayment({ id: "m1", cardId: "20", date: "2026-10-01", amount: 50_00, status: "paid" })
}

const open = async (search = "") => {
	const repo = new InMemoryRepository()
	await seed(repo)
	const history = fakeHistory(`/owed${search}`)
	mounted = mount(OwedPage, {
		target: document.body,
		props: {
			open: async () => ({ ok: true as const, repo }),
			clock: () => new Date("2026-10-31T03:00:00Z"),
			address: history.bar,
			newId: () => "id-1",
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

const tiles = () => [...document.querySelectorAll(".owed-list a.tile")].map((el) => el.getAttribute("data-card"))

test("only the cards that owe, most urgent first", async () => {
	await open()
	expect(tiles()).toEqual(["7", "12.3"])
	expect($('.owed-list a[data-card="7"]')?.getAttribute("href")).toBe("/owed?card=7")
})

const sortChip = () => $<HTMLButtonElement>(".owed-main > .tx-controls > .tx-chips > button.tx-chip.tx-sort")

/** Opens the sort sheet from the chip, picks a field (or keeps it) and a way, and applies. */
const sortBy = async (field: string | null, dir: string | null) => {
	await press(sortChip())
	if (field) await press($(`dialog [data-sort="${field}"]`))
	if (dir) await press($(`dialog [data-dir="${dir}"]`))
	await press($("dialog [data-action=apply]"))
}

test("the sort is the shared control row's chip, as on Cards: no search, no Filter", async () => {
	await open()
	expect(text(sortChip())).toBe("Sort: Most urgent first ▾")
	expect(sortChip()?.dataset["action"]).toBe("sort")
	expect($(".tx-controls input.search")).toBeNull()
	expect($('.tx-controls [data-action="filter"]')).toBeNull()
	// The control row heads the tab's column, before the list, as on Cards.
	expect($(".owed-main > .tx-controls + .owed-list")).not.toBeNull()
})

test("the order comes from the address, and a new one is written in place, keys at default left out", async () => {
	const { history } = await open("?sort=left")
	expect(tiles()).toEqual(["12.3", "7"])
	expect(text(sortChip())).toBe("Sort: Most owed ▾")
	await sortBy(null, "asc")
	expect(history.now()).toBe("/owed?sort=left&dir=asc")
	expect(history.size()).toBe(1)
	expect(tiles()).toEqual(["7", "12.3"])
	await sortBy("urgency", null)
	expect(history.now()).toBe("/owed")
	history.userBack()
	await settle()
})

test("a tile opens the card's panel over the tab, pushing ?card=; the sort keeps it", async () => {
	const { history } = await open("?sort=card")
	await press($('.owed-list a[data-card="12.3"]'))
	expect(history.now()).toBe("/owed?sort=card&card=12.3")
	expect(history.size()).toBe(2)
	expect($(".panel-layout")?.hasAttribute("data-panel")).toBe(true)
	expect($(".detail-panel .card-hero")).not.toBeNull()
	expect($('.owed-list a[data-card="12.3"]')?.getAttribute("aria-current")).toBe("true")
	await sortBy(null, "desc")
	expect(history.now()).toBe("/owed?sort=card&dir=desc&card=12.3")
	history.userBack()
	await settle()
	expect($(".detail-panel")).toBeNull()
})

test("Pay opens the card's panel on its pay form with what is left; saving returns to the card and the tile goes", async () => {
	const { repo, history } = await open()
	await press($('.owed-list .tile-box:has([data-card="7"]) [data-action="pay"]'))
	expect(history.now()).toBe("/owed?card=7")
	expect($<HTMLInputElement>('.detail-panel input[name="amount"]')?.value).toBe("1000")
	$(".detail-panel form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
	expect(await repo.listCardPayments("7")).toMatchObject([{ id: "id-1", amount: 1_000_00, status: "paid" }])
	expect($(".detail-panel .card-hero")).not.toBeNull()
	expect(history.now()).toBe("/owed?card=7")
	expect(tiles()).toEqual(["12.3"])
})

test("a pasted ?card= opens the panel at once; an unknown card opens nothing and its key goes", async () => {
	await open("?card=20")
	expect($(".detail-panel .card-hero")).not.toBeNull()
	if (mounted) unmount(mounted)
	mounted = undefined
	const { history } = await open("?sort=due&card=99")
	expect($(".detail-panel")).toBeNull()
	expect(history.now()).toBe("/owed?sort=due")
})

test("nothing owed says so", async () => {
	const repo = new InMemoryRepository()
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 })
	await repo.saveCard(card("7"))
	mounted = mount(OwedPage, {
		target: document.body,
		props: { open: async () => ({ ok: true as const, repo }), address: fakeHistory("/owed").bar },
	})
	await settle()
	expect(text($(".owed-list .empty"))).toBe("Nothing owed on any card.")
})

test("a store that will not open shows the banner", async () => {
	mounted = mount(OwedPage, {
		target: document.body,
		props: {
			open: async () => ({ ok: false as const, message: () => "No storage." }),
			address: fakeHistory("/owed").bar,
		},
	})
	await settle()
	expect(text($(".error-banner p"))).toBe("No storage.")
})
