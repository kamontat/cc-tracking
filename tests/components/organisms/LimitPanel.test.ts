import type { Card, LimitGroup } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import LimitPanel from "#components/organisms/LimitPanel.svelte"
import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository } from "#lib/storage/repository"
import { seedLocations } from "#lib/storage/seed-locations"
import { RecordPanel } from "#lib/ui/record-panel.svelte"
import { fakeHistory } from "../../lib/ui/fake-history"

/**
 * The limit panel (RD-23, RD-24): a limit group's limit, used and room and its cards, each
 * opening that card's panel; *Edit* puts the group form in its place, and *+ Add limit* a blank one.
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

const POOL: LimitGroup = { id: "g1", name: "Pool", limit: 100_000_00, owner: "RI", color: "teal" }
const SPARE: LimitGroup = { id: "g2", name: "Spare", limit: 20_000_00, owner: "KC" }

const card = (id: string, name: string, extra: Partial<Card> = {}): Card => ({
	id,
	name,
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g1",
	...extra,
})

const stocked = async () => {
	const repo = new InMemoryRepository()
	await seedLocations(repo, { getItem: () => null, setItem: () => {} })
	await repo.saveLimitGroup(POOL)
	await repo.saveLimitGroup(SPARE)
	await repo.saveCard(card("7", "KTC Visa"))
	await repo.saveCard(card("12.3", "KBank Visa", { last4: "0193" }))
	await repo.saveCard(card("31", "UOB Yolo", { archived: true }))
	return repo
}

const show = async (repo: InMemoryRepository, start = "/cards/limits?limit=g1", answer = true) => {
	const history = fakeHistory(start)
	let asked = 0
	const panel = new RecordPanel({
		address: history.bar,
		path: "/cards/limits",
		kinds: ["card", "limit"],
		ask: () => {
			asked++
			return answer
		},
	})
	stop = panel.start()
	let changes = 0
	let ids = 0
	mounted = mount(LimitPanel, {
		target: document.body,
		props: {
			panel,
			open: async () => ({ ok: true as const, repo }),
			newId: () => `new-${++ids}`,
			onchange: () => {
				changes++
			},
		},
	})
	await settle()
	return { history, panel, changes: () => changes, asked: () => asked }
}

const press = async (selector: string) => {
	const target = $(selector)
	if (!target) throw new Error(`no ${selector}`)
	target.click()
	await settle()
}

const type = async (name: string, value: string) => {
	const input = $<HTMLInputElement>(`.detail-panel [name="${name}"]`)
	if (!input) throw new Error(`no ${name}`)
	input.value = value
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

const submit = async () => {
	$(".detail-panel form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
	await settle()
}

const title = () => text($(".detail-panel__head h2"))
const detail = () => text($(".detail-panel__head .detail-panel__detail"))

test("nothing opens without a limit in the address", async () => {
	await show(await stocked(), "/cards/limits")
	expect($(".detail-panel")).toBeNull()
})

test("a card in the address wins: the limit panel draws nothing", async () => {
	const { panel } = await show(await stocked(), "/cards/limits?limit=g1&card=12.3")
	expect(panel.view?.kind).toBe("card")
	expect($(".detail-panel")).toBeNull()
})

test("an unknown limit opens nothing, and its key leaves the address", async () => {
	const { history, panel } = await show(await stocked(), "/cards/limits?q=a&limit=nope")
	expect($(".detail-panel")).toBeNull()
	expect(panel.view).toBeNull()
	expect(history.now()).toBe("/cards/limits?q=a")
})

test("the head names the group, its holder and its cards, in its colour, with Edit", async () => {
	await show(await stocked())
	expect(title()).toBe("Pool")
	expect(detail()).toBe("RI · 3 cards")
	expect($(".detail-panel__head .mini")?.getAttribute("data-g")).toBe("teal")
	expect(text($('.detail-panel__head [data-action="edit"]'))).toBe("Edit")
})

test("the body shows the room, what is used of the limit, and the bar", async () => {
	const repo = await stocked()
	await repo.savePurchase({ id: "p", cardId: "7", date: "2026-01-02", amount: 25_000_00, note: "" })
	await show(repo)
	expect(text($(".limit-detail [data-room]"))).toBe("฿75,000.00")
	expect(text($(".limit-detail [data-used]"))).toBe("฿25,000.00 used of ฿100,000.00")
	expect(text($(".limit-detail [data-note]"))).toBe("25% used")
	expect($<HTMLElement>(".limit-detail .usage > span")?.style.inlineSize).toBe("25%")
})

test("its cards are a row list, archived ones said so, each opening its card's panel deeper", async () => {
	const { history, panel } = await show(await stocked())
	const rows = $$(".limit-detail .row-panel > button")
	// By id, as the group's panel on the list names them.
	expect(rows.map((row) => row.getAttribute("data-card"))).toEqual(["12.3", "31", "7"])
	expect(text(rows[0]?.querySelector(".set-row__text > span"))).toBe("12.3) KBank Visa")
	expect(text(rows[0]?.querySelector(".mini"))).toBe("0193")
	expect(text(rows[1])).toContain("Archived")
	expect(text(rows[2])).not.toContain("Archived")
	rows[0]?.click()
	await settle()
	expect(panel.view).toEqual({ kind: "card", id: "12.3", form: null })
	expect(history.now()).toBe("/cards/limits?card=12.3")
	expect(history.size()).toBe(2)
	expect($(".detail-panel")).toBeNull()
	history.userBack()
	await settle()
	expect(title()).toBe("Pool")
})

test("a group no card uses says so", async () => {
	await show(await stocked(), "/cards/limits?limit=g2")
	expect(text($(".limit-detail .empty"))).toBe("No card draws on this limit yet.")
	expect($(".limit-detail .row-panel")).toBeNull()
})

test("Edit puts the group form in its place, with the address unchanged; a save goes back", async () => {
	const { history, panel, changes } = await show(await stocked())
	await press('[data-action="edit"]')
	expect(panel.view?.form).toEqual({ name: "edit" })
	expect(history.now()).toBe("/cards/limits?limit=g1")
	expect(history.size()).toBe(2)
	expect(title()).toBe("Edit limit")
	expect(detail()).toBe("Pool")
	expect($('[data-action="panel-back"]')).not.toBeNull()
	expect($(".detail-panel__body")?.getAttribute("data-slide")).toBe("in")
	expect($<HTMLInputElement>('.detail-panel [name="name"]')?.value).toBe("Pool")
	await type("name", "Pool Biz")
	expect(panel.dirty).toBe(true)
	await submit()
	expect(changes()).toBe(1)
	expect(panel.view?.form).toBeNull()
	expect(history.at()).toBe(0)
	expect(title()).toBe("Pool Biz")
})

test("Cancel and ‹ go back to the group", async () => {
	const { panel } = await show(await stocked())
	await press('[data-action="edit"]')
	await press('.detail-panel [data-action="cancel"]')
	expect(panel.view?.form).toBeNull()
	await press('[data-action="edit"]')
	await press('[data-action="panel-back"]')
	expect(panel.view?.form).toBeNull()
	expect(title()).toBe("Pool")
})

test("a group no card uses can be deleted from its form; the panel closes", async () => {
	const repo = await stocked()
	const { history, changes } = await show(repo, "/cards/limits?q=s&limit=g2")
	await press('[data-action="edit"]')
	await press('[data-action="delete-group"]')
	await press('[data-action="confirm-delete"]')
	expect((await repo.listLimitGroups()).map((g) => g.id)).toEqual(["g1"])
	expect(changes()).toBe(1)
	expect($(".detail-panel")).toBeNull()
	expect(history.now()).toBe("/cards/limits?q=s")
})

test("a group a card uses has no Delete", async () => {
	await show(await stocked())
	await press('[data-action="edit"]')
	expect($('[data-action="delete-group"]')).toBeNull()
})

test("+ Add limit opens a blank form with no address; adding writes ?limit=<id> over its entry", async () => {
	const repo = await stocked()
	const { history, panel, changes } = await show(repo, "/cards/limits?sort=room")
	panel.blank("limit")
	await settle()
	expect(history.now()).toBe("/cards/limits?sort=room")
	expect(title()).toBe("New limit")
	expect($('[data-action="panel-back"]')).toBeNull()
	await type("name", "Fresh")
	await type("limit", "5000")
	await press('[data-owner="NT"]')
	await submit()
	const fresh = (await repo.listLimitGroups()).find((g) => g.name === "Fresh")
	expect(fresh).toMatchObject({ id: "new-1", limit: 5_000_00, owner: "NT" })
	expect(changes()).toBe(1)
	expect(history.now()).toBe("/cards/limits?sort=room&limit=new-1")
	expect(history.size()).toBe(2)
	expect(title()).toBe("Fresh")
})

test("a failed save keeps the form, the typing and the reason; a retry writes the same new group", async () => {
	const repo = await stocked()
	const save = repo.saveLimitGroup.bind(repo)
	let fail = true
	repo.saveLimitGroup = async (group: LimitGroup) => {
		if (fail) throw new Error("Disk full")
		return save(group)
	}
	const { panel } = await show(repo, "/cards/limits")
	panel.blank("limit")
	await settle()
	await type("name", "Fresh")
	await type("limit", "5000")
	await press('[data-owner="KC"]')
	await submit()
	expect(text($(".detail-panel .error-banner"))).toContain("Disk full")
	expect($<HTMLInputElement>('.detail-panel [name="name"]')?.value).toBe("Fresh")
	fail = false
	await submit()
	expect((await repo.listLimitGroups()).filter((g) => g.name === "Fresh").map((g) => g.id)).toEqual(["new-1"])
})

test("× with a changed form asks first", async () => {
	const { panel, asked } = await show(await stocked(), "/cards/limits?limit=g1", false)
	await press('[data-action="edit"]')
	await press('.detail-panel [data-owner="KC"]')
	await press('[data-action="close-panel"]')
	expect(asked()).toBe(1)
	expect(panel.open).toBe(true)
})

test("follows a language switch", async () => {
	await show(await stocked())
	setLocale("th")
	await settle()
	expect(text($('.detail-panel__head [data-action="edit"]'))).not.toBe("Edit")
})
