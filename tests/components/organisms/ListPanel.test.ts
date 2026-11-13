import type { Card, PurchaseList } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import ListPanel from "#components/organisms/ListPanel.svelte"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository } from "#lib/storage/repository"
import { seedLocations } from "#lib/storage/seed-locations"
import { RecordPanel } from "#lib/ui/record-panel.svelte"
import { fakeHistory } from "../../lib/ui/fake-history"

/**
 * The list panel (RD-23, RD-26): a purchase list's status, date, lines and total, each line
 * opening its card's panel a step deeper, and the actions its status allows: _Continue_ for a
 * draft and _Record reply_ for a waiting list (to the edit page), _Merge_, a draft's _Delete_ and
 * a waiting list's two-step _Confirm_.
 */
let mounted: ReturnType<typeof mount> | undefined
let stop: (() => void) | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	stop?.()
	stop = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const settle = async (rounds = 20) => {
	for (let i = 0; i < rounds; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]

const card = (id: string, name: string): Card => ({
	id,
	name,
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g1",
})

const DRAFT: PurchaseList = {
	id: "d1",
	date: "2026-10-31",
	status: "draft",
	lines: [
		{ cardId: "7", amount: 1_000_00, note: "toner" },
		{ cardId: "12.3", amount: 0 },
	],
}

const WAITING: PurchaseList = {
	id: "w1",
	date: "2026-10-30",
	status: "sent",
	sentAt: "2026-10-30T05:00:00Z",
	lines: [{ cardId: "7", amount: 200_00 }],
}

const SAVED: PurchaseList = {
	id: "s1",
	date: "2026-10-29",
	status: "saved",
	movedTo: "d1",
	lines: [
		{ cardId: "7", amount: 100_00, made: true, actual: 90_00 },
		{ cardId: "12.3", amount: 200_00, made: false },
	],
}

const stocked = async (lists: PurchaseList[] = [DRAFT, WAITING, SAVED]) => {
	const repo = new InMemoryRepository()
	await seedLocations(repo, { getItem: () => null, setItem: () => {} })
	await repo.saveLimitGroup({ id: "g1", name: "Pool", limit: 100_000_00 })
	await repo.saveCard(card("7", "KTC Visa"))
	await repo.saveCard(card("12.3", "KBank Visa"))
	for (const list of lists) await repo.savePurchaseList(list)
	return repo
}

const show = async (repo: InMemoryRepository, start: string) => {
	const history = fakeHistory(start)
	const panel = new RecordPanel({ address: history.bar, path: "/transactions/lists", kinds: ["card", "list"] })
	stop = panel.start()
	let changes = 0
	mounted = mount(ListPanel, {
		target: document.body,
		props: {
			panel,
			open: async () => ({ ok: true as const, repo }),
			clock: () => new Date("2026-10-31T03:00:00Z"),
			onchange: () => {
				changes++
			},
		},
	})
	await settle()
	return { history, panel, changes: () => changes }
}

const press = async (selector: string) => {
	const target = $(selector)
	if (!target) throw new Error(`no ${selector}`)
	target.click()
	await settle()
}

const title = () => text($(".detail-panel__head h2"))
const detail = () => text($(".detail-panel__head .detail-panel__detail"))
const actions = () => $$(".list-actions > *").map((el) => el.getAttribute("data-action"))

test("nothing opens without a list in the address, nor over another kind", async () => {
	await show(await stocked(), "/transactions/lists")
	expect($(".detail-panel")).toBeNull()
	await show(await stocked(), "/transactions/lists?card=7")
	expect($(".detail-panel")).toBeNull()
})

test("a draft: its date, status and cards in the head; its lines and total; Continue, Delete", async () => {
	await show(await stocked(), "/transactions/lists?list=d1")
	expect(title()).toBe("List for Sat, 31 Oct 2026")
	expect(detail()).toBe("Draft · 2 cards")
	const lines = $$(".list-lines [data-card]")
	expect(lines.map((el) => el.getAttribute("data-card"))).toEqual(["7", "12.3"])
	expect(lines[0]?.localName).toBe("button")
	expect(text(lines[0])).toContain("7) KTC Visa")
	expect(text(lines[0])).toContain("toner")
	expect(text(lines[0])).toContain("฿1,000.00")
	expect(text(lines[1])).toContain("No amount yet")
	expect(text($(".list-total"))).toBe("Total ฿1,000.00")
	expect(actions()).toEqual(["continue", "delete-draft"])
	const go = $<HTMLAnchorElement>('[data-action="continue"]')
	expect(go?.localName).toBe("a")
	expect(go?.getAttribute("href")).toBe("/transactions/lists/edit?list=d1")
	expect($('[data-action="delete-draft"]')?.getAttribute("data-variant")).toBe("danger")
})

test("a waiting list offers Record reply at the edit page and a two-step Confirm", async () => {
	const repo = await stocked()
	const { changes } = await show(repo, "/transactions/lists?list=w1")
	expect(detail()).toBe("Waiting for the spender · 1 card")
	expect(actions()).toEqual(["record-reply", "confirm-list"])
	expect($('[data-action="record-reply"]')?.getAttribute("href")).toBe("/transactions/lists/edit?list=w1")
	await press('[data-action="confirm-list"]')
	expect((await repo.listPurchaseLists()).find((l) => l.id === "w1")?.status).toBe("sent")
	await press('[data-action="save-list"]')
	expect((await repo.listPurchaseLists()).find((l) => l.id === "w1")?.status).toBe("saved")
	expect(changes()).toBe(1)
	// The panel stays on the list, saved now.
	expect(detail()).toBe("Saved · 1 card")
	expect(actions()).toEqual([])
})

test("a saved list: what was bought, what was not, and the draft its unmade lines moved to", async () => {
	const { history } = await show(await stocked(), "/transactions/lists?list=s1")
	expect(detail()).toBe("Saved · 2 cards")
	const lines = $$(".list-lines [data-card]")
	expect(text(lines[0])).toContain("฿90.00")
	expect(text(lines[0])).toContain("planned ฿100.00")
	expect(text(lines[1])).toContain("Not made")
	expect(text($(".list-total"))).toBe("Total ฿90.00")
	expect(text($('[data-tone="ok"]'))).toContain("Saved 1 purchase, ฿90.00")
	expect(actions()).toEqual([])
	await press('[data-action="open-draft"]')
	expect(history.now()).toBe("/transactions/lists?list=d1")
	expect(title()).toBe("List for Sat, 31 Oct 2026")
	history.userBack()
	await settle()
	expect(history.now()).toBe("/transactions/lists?list=s1")
})

test("a line opens its card's panel a step deeper, so Back returns to the list", async () => {
	const { history, panel } = await show(await stocked(), "/transactions/lists?list=d1")
	await press('.list-lines [data-card="12.3"]')
	expect(history.now()).toBe("/transactions/lists?card=12.3")
	expect(panel.record).toEqual({ kind: "card", id: "12.3" })
	expect($(".list-lines")).toBeNull()
	history.userBack()
	await settle()
	expect(panel.record).toEqual({ kind: "list", id: "d1" })
	expect($(".list-lines")).not.toBeNull()
})

test("Delete removes a draft in one step and closes the panel", async () => {
	const repo = await stocked()
	const { history, changes } = await show(repo, "/transactions/lists?list=d1")
	await press('[data-action="delete-draft"]')
	expect((await repo.listPurchaseLists()).map((l) => l.id).sort()).toEqual(["s1", "w1"])
	expect(changes()).toBe(1)
	expect($(".detail-panel")).toBeNull()
	expect(history.now()).toBe("/transactions/lists")
})

test("Merge joins the other same-day lists of its status, a filtered-out one included", async () => {
	const other: PurchaseList = { ...WAITING, id: "w2", lines: [{ cardId: "12.3", amount: 50_00 }] }
	const repo = await stocked([DRAFT, WAITING, other])
	const { changes } = await show(repo, "/transactions/lists?list=w1")
	expect(actions()).toEqual(["record-reply", "merge", "confirm-list"])
	expect(text($('[data-action="merge"]'))).toBe("Merge with 1 other list")
	await press('[data-action="merge"]')
	const stored = await repo.listPurchaseLists()
	expect(stored.map((l) => l.id).sort()).toEqual(["d1", "w1"])
	expect(stored.find((l) => l.id === "w1")?.lines.map((l) => l.cardId)).toEqual(["7", "12.3"])
	expect(changes()).toBe(1)
	expect(detail()).toBe("Waiting for the spender · 2 cards")
	expect(actions()).toEqual(["record-reply", "confirm-list"])
})

test("a list the store does not hold opens nothing, and its key leaves the address", async () => {
	const { history } = await show(await stocked(), "/transactions/lists?list=nope")
	expect($(".detail-panel")).toBeNull()
	expect(history.now()).toBe("/transactions/lists")
})

test("× closes it", async () => {
	const { history } = await show(await stocked(), "/transactions/lists?list=d1")
	await press('.detail-panel [data-action="close-panel"]')
	expect($(".detail-panel")).toBeNull()
	expect(history.now()).toBe("/transactions/lists")
})

test("reads in Thai", async () => {
	setLocale("th")
	await show(await stocked(), "/transactions/lists?list=d1")
	expect(title()).toContain("ใบรายการวันที่")
	expect(detail()).toContain("ฉบับร่าง")
	expect(text($(".list-total"))).toContain("รวม")
})
