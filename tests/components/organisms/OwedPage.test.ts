import type { Card } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import OwedPage from "#components/organisms/OwedPage.svelte"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { fakeHistory } from "../../lib/ui/fake-history"
import { saveLocations } from "./list-support"

/**
 * Home's _Owed_ tab (`/owed`, RD-25): the money to have ready each day. A calendar by default
 * (or the days by week or by month), the totals over it, late money apart with _Pay_, and the
 * view kept in the address (`q`, `f.locations`, `f.owners`, `f.range`, `f.shows`, `view`,
 * `month`, `day`). _Pay_ opens the card's panel on its pay form (`?card=`).
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
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]
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

// Today is 31 Oct 2026. Each card closes on the 25th and is due 20 days later.
const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00, owner: "KC" })
	await repo.saveLimitGroup({ id: "g2", name: "G2", limit: 100_000_00, owner: "NT" })
	for (const c of [card("7"), card("12.3"), card("20"), card("21", { limitGroupId: "g2" })]) await repo.saveCard(c)
	await saveLocations(repo, ["krabi"])
	// 7: September's bill, due 15 Oct, is late.
	await repo.savePurchase({ id: "p1", cardId: "7", date: "2026-09-10", amount: 1_000_00, note: "" })
	// 12.3: 5,000 due 14 Nov, 2,000 of it planned for 5 Nov.
	await repo.savePurchase({ id: "p2", cardId: "12.3", date: "2026-10-10", amount: 5_000_00, note: "" })
	await repo.saveCardPayment({ id: "m1", cardId: "12.3", date: "2026-11-05", amount: 2_000_00, status: "planned" })
	// 20: still open, due 15 Dec, past the 30 days.
	await repo.savePurchase({ id: "p3", cardId: "20", date: "2026-10-28", amount: 400_00, note: "" })
	// 21 (NT's): 800 due 14 Nov.
	await repo.savePurchase({ id: "p4", cardId: "21", date: "2026-10-12", amount: 800_00, note: "" })
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

const total = (name: string) => text($(`.owed-totals [data-total="${name}"] b`))
const lines = (root: string) => $$(`${root} .owed-line`).map((el) => `${el.dataset["card"]} ${el.dataset["kind"]}`)

test("the calendar is the default: the totals, the next paying day's month and that day's cards", async () => {
	const { history } = await open()
	expect(total("range")).toBe("฿5,800.00")
	expect(total("next")).toBe("฿2,000.00")
	expect(total("week")).toBe("฿2,000.00")
	expect(total("biggest")).toBe("฿3,800.00")
	expect(text($(".owed-cal h3"))).toContain("November 2026")
	expect(text($('.owed-cal [data-date="2026-11-14"] .v'))).toBe("3.8K")
	// A week's total is the last column.
	expect(text($('.owed-cal [data-week="2026-11-09"]'))).toBe("3.8K")
	// The next paying day is picked, and the address stays bare.
	expect($('.owed-cal [data-date="2026-11-05"]')?.getAttribute("aria-pressed")).toBe("true")
	expect(lines(".owed-day")).toEqual(["12.3 plan"])
	expect(history.now()).toBe("/owed")
})

test("late money sits apart, its Pay opening the card's panel on the pay form", async () => {
	const { history } = await open()
	expect(text($(".owed-late h2"))).toBe("฿1,000.00 is late: pay it today")
	expect(lines(".owed-late")).toEqual(["7 bill"])
	await press($('.owed-late .owed-line[data-card="7"] [data-action="pay"]'))
	expect(history.now()).toBe("/owed?card=7")
	expect($<HTMLInputElement>('.detail-panel input[name="amount"]')?.value).toBe("1000")
})

test("a day picked in the calendar shows its cards, kept in the address as day", async () => {
	const { history } = await open()
	await press($('.owed-cal [data-date="2026-11-14"]'))
	expect(history.now()).toBe("/owed?day=2026-11-14")
	expect(lines(".owed-day")).toEqual(["12.3 bill", "21 bill"])
	expect(text($(".owed-day [data-by-then]"))).toBe("฿5,800.00")
	// A day with nothing to pay is not a button.
	expect($('.owed-cal [data-date="2026-11-15"]')?.tagName).not.toBe("BUTTON")
})

test("the month before and after page through, kept as month", async () => {
	const { history } = await open()
	expect($<HTMLButtonElement>('.owed-cal [data-action="month-after"]')?.disabled).toBe(true)
	await press($('.owed-cal [data-action="month-before"]'))
	expect(text($(".owed-cal h3"))).toContain("October 2026")
	expect(history.now()).toBe("/owed?month=2026-10")
	expect($<HTMLButtonElement>('.owed-cal [data-action="month-before"]')?.disabled).toBe(true)
})

test("By week lists the days under each week's total; a day opens in place to its cards and Pay", async () => {
	const { history } = await open()
	await press($('.owed-layout [data-layout="week"]'))
	expect(history.now()).toBe("/owed?view=week")
	expect($(".owed-cal")).toBeNull()
	expect($$(".owed-days .owed-head").map(text)).toEqual([
		"Next week 2 Nov – 8 Nov ฿2,000.00",
		"Week of 9 Nov 9 Nov – 15 Nov ฿3,800.00",
	])
	const row = $('.owed-days [data-row="day:2026-11-14"]')
	await press(row?.querySelector("button.a-hit"))
	expect(row?.querySelector("button.a-hit")?.getAttribute("aria-expanded")).toBe("true")
	expect([...(row?.querySelectorAll('[data-action="pay"]') ?? [])].map((b) => b.getAttribute("data-card"))).toEqual([
		"12.3",
		"21",
	])
	await press($('.owed-layout [data-layout="month"]'))
	expect($$(".owed-days .owed-head").map(text)).toEqual(["November 2026 ฿5,800.00"])
})

test("Filter: range, places, holders and kinds; a pick is a chip and an f. key", async () => {
	const { history } = await open()
	await press($('.tx-controls [data-action="filter"]'))
	expect(text($("dialog h2"))).toBe("Filter what to pay")
	expect($$("dialog fieldset legend").map(text)).toEqual(["Range", "Kept in", "Account holder", "Shows"])
	await press($('dialog [data-range="all"]'))
	await press($('dialog [data-owner="KC"]'))
	await press($("dialog [data-action=apply]"))
	expect(history.now()).toBe("/owed?f.owners=KC&f.range=all")
	// Card 20's open statement is in range now, an estimate apart from the total.
	expect(total("range")).toBe("฿5,000.00")
	expect(text($('.owed-totals [data-total="range"]'))).toContain("~฿400.00 more still open")
	expect($$(".tx-chips [data-chip]").map(text)).toEqual(["KC ×", "Everything owed ×"])
	await press($('.tx-chips [data-chip="range"]'))
	expect(history.now()).toBe("/owed?f.owners=KC")
})

test("the search narrows in place, kept as q", async () => {
	const { history } = await open()
	const box = $<HTMLInputElement>(".tx-controls input.search")
	if (!box) throw new Error("no search")
	box.value = "21"
	box.dispatchEvent(new Event("input"))
	await settle()
	expect(history.now()).toBe("/owed?q=21")
	expect(total("range")).toBe("฿800.00")
	expect($(".owed-late")).toBeNull()
})

test("a pasted ?card= opens the panel at once", async () => {
	await open("?view=week&card=20")
	expect($(".detail-panel .card-hero")).not.toBeNull()
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
	expect(text($(".owed-main .empty"))).toBe("Nothing owed on any card.")
	expect($(".tx-controls")).toBeNull()
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
