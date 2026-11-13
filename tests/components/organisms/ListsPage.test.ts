import type { Card, PurchaseList } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import ListsPage from "#components/organisms/ListsPage.svelte"
import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository, type Repository } from "#lib/storage/repository"
import { fakeHistory } from "../../lib/ui/fake-history"

/**
 * The Lists tab (`/transactions/lists`, RD-22): every purchase list with its search, filters and
 * grouping in the address (`q`, `f.statuses`, `f.cards`, `f.range`, `f.from`, `f.to`, `by`), a
 * list opening in its panel (`?list=`), a line's card in the card's panel (`?card=`), and _+ Add
 * list_ leading to the builder.
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

const exit = async () => {
	await new Promise((resolve) => setTimeout(resolve, 450))
	await settle()
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]

const card = (id: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1234",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
})

const list = (id: string, status: PurchaseList["status"], cards: string[], extra: Partial<PurchaseList> = {}) =>
	({
		id,
		date: "2026-10-30",
		status,
		lines: cards.map((cardId) => ({ cardId, amount: 100_00 })),
		...(status === "sent" ? { sentAt: "2026-10-30T05:00:00Z" } : {}),
		...extra,
	}) as PurchaseList

const seed = async (repo: Repository) => {
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 })
	await repo.saveCard(card("7"))
	await repo.saveCard(card("12"))
	for (const record of defaultLocations(DEFAULT_SETTINGS))
		await repo.saveLocation({ ...record, takesPurchases: record.id === "krabi" })
	await repo.savePurchaseList(list("w1", "sent", ["12"]))
	await repo.savePurchaseList(list("d1", "draft", ["7"], { lines: [{ cardId: "7", amount: 100_00, note: "toner" }] }))
}

const open = async (search = "", extra: (repo: Repository) => Promise<void> = async () => {}) => {
	const repo = new InMemoryRepository()
	await seed(repo)
	await extra(repo)
	const history = fakeHistory(`/transactions/lists${search}`)
	mounted = mount(ListsPage, {
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

const type = async (value: string) => {
	const input = $<HTMLInputElement>('input[name="q"]')
	if (!input) throw new Error("no search")
	input.value = value
	input.dispatchEvent(new Event("input"))
	await settle()
}

const rows = () => $$('.list-index [data-row^="list:"]').map((r) => r.getAttribute("data-row"))

test("lists every list in sections, with a search, Filter, the group chip and + Add list, but no sort", async () => {
	await open()
	expect(rows()).toEqual(["list:d1", "list:w1"])
	expect($('input[name="q"]')?.getAttribute("placeholder")).toBe("Search card or note")
	expect($('[data-action="filter"]')).not.toBeNull()
	expect($('[data-action="sort"]')).toBeNull()
	expect($('[data-action="group"]')?.textContent).toContain("Group: Status")
	const add = $<HTMLAnchorElement>('.tx-ctl [data-action="add-list"]')
	expect(add?.localName).toBe("a")
	expect(add?.getAttribute("href")).toBe("/transactions/lists/new")
	expect(add?.getAttribute("data-variant")).toBe("quiet")
	expect(text(add)).toBe("Add list")
	// What is owed and the ledger are not here.
	expect($(".tx-owed, [data-testid='summary']")).toBeNull()
})

test("searching writes ?q= in place", async () => {
	const { history } = await open()
	await type("toner")
	expect(history.now()).toBe("/transactions/lists?q=toner")
	expect(history.size()).toBe(1)
	expect(rows()).toEqual(["list:d1"])
})

test("the filter sheet applies statuses, written as repeated f.statuses, each a removable chip", async () => {
	const { history } = await open()
	await press($('[data-action="filter"]'))
	expect(text($("dialog h2"))).toBe("Filter lists")
	await press($('dialog [data-status="saved"]'))
	await press($('dialog [data-status="sent"]'))
	await press($('dialog [data-action="apply"]'))
	await exit()
	expect(history.now()).toBe("/transactions/lists?f.statuses=saved&f.statuses=sent")
	expect(rows()).toEqual(["list:w1"])
	await press($('[data-chip="status:sent"]'))
	await press($('[data-chip="status:saved"]'))
	expect(history.now()).toBe("/transactions/lists")
})

test("the card and date filters read from f.cards and f.range, shown as chips", async () => {
	await open("?f.cards=12&f.range=month")
	expect($('[data-chip="card:12"]')).not.toBeNull()
	expect(text($('[data-chip="range"]'))).toContain("This month")
	expect(rows()).toEqual(["list:w1"])
})

test("grouping by month is kept in the address as by", async () => {
	const { history } = await open()
	await press($('[data-action="group"]'))
	await press($('dialog [data-by="month"]'))
	await press($('dialog [data-action="apply"]'))
	await exit()
	expect(history.now()).toBe("/transactions/lists?by=month")
})

test("the old Lists view keys are ignored", async () => {
	await open("?view=lists&lq=toner&status=saved&lby=none")
	expect($<HTMLInputElement>('input[name="q"]')?.value).toBe("")
	expect(rows()).toEqual(["list:d1", "list:w1"])
})

test("a row opens its list's panel, pushing ?list=; another row swaps it; Back closes it", async () => {
	const { history } = await open("?q=card")
	await press($('[data-row="list:d1"] .a-hit'))
	expect(history.now()).toBe("/transactions/lists?q=card&list=d1")
	expect(history.size()).toBe(2)
	expect($(".panel-layout")?.hasAttribute("data-panel")).toBe(true)
	expect($('[data-row="list:d1"] .a-hit')?.getAttribute("aria-current")).toBe("true")
	expect($('.detail-panel [data-action="continue"]')?.getAttribute("href")).toBe("/transactions/lists/edit?list=d1")
	await press($('[data-row="list:w1"] .a-hit'))
	expect(history.now()).toBe("/transactions/lists?q=card&list=w1")
	expect(history.size()).toBe(2)
	history.userBack()
	await settle()
	expect(history.now()).toBe("/transactions/lists?q=card")
	expect($(".detail-panel")).toBeNull()
})

test("a pasted ?list= opens the panel at once, and a search keeps it", async () => {
	const { history } = await open("?list=w1")
	expect($('.detail-panel [data-action="record-reply"]')).not.toBeNull()
	await type("card")
	expect(history.now()).toBe("/transactions/lists?q=card&list=w1")
})

test("a line's card opens the card's panel a step deeper; card wins over list", async () => {
	const { history } = await open("?list=d1")
	await press($('.detail-panel .list-lines [data-card="7"]'))
	expect(history.now()).toBe("/transactions/lists?card=7")
	expect($(".detail-panel .list-lines")).toBeNull()
	expect($(".detail-panel .card-detail, .detail-panel [data-action='use-on-list']")).not.toBeNull()
	history.userBack()
	await settle()
	expect($(".detail-panel .list-lines")).not.toBeNull()
	if (mounted) unmount(mounted)
	mounted = undefined
	await open("?list=d1&card=7")
	expect($(".detail-panel .list-lines")).toBeNull()
	expect($(".detail-panel [data-action='use-on-list']")).not.toBeNull()
})

test("deleting a draft in its panel takes its row off the list", async () => {
	const { repo } = await open("?list=d1")
	await press($('.detail-panel [data-action="delete-draft"]'))
	expect((await repo.listPurchaseLists()).map((l) => l.id)).toEqual(["w1"])
	expect(rows()).toEqual(["list:w1"])
	expect($(".detail-panel")).toBeNull()
})

test("re-renders in Thai", async () => {
	await open()
	setLocale("th")
	flushSync()
	expect(text($('[data-action="add-list"]'))).toBe("เพิ่มใบรายการ")
})
