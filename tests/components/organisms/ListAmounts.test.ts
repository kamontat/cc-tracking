import type { ReadyRow } from "#lib/domain/home"
import type { GroupRoom } from "#lib/domain/room"
import type { Card, CardLedger, CardPayment, LimitGroup } from "#lib/domain/types"
import type { ListSheet } from "#lib/ui/list-address"

import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import ListAmounts from "#components/organisms/ListAmounts.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * Writing a purchase list (DD-195): the list's rows, *+ Add a card*, and the add-a-card sheet,
 * the picker or one card with its use, orders and warnings. The sheet is the page's to move, so
 * the harness plays the page: each `onsheet` becomes the next `sheet`.
 */
let mounted: ReturnType<typeof mount> | undefined
let values: SvelteMap<string, unknown> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	values = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

/** Flushes Svelte's updates and anything they await. */
const settle = async () => {
	for (let i = 0; i < 3; i++) {
		await new Promise<void>((resolve) => setTimeout(resolve, 0))
		flushSync()
	}
}

const card = (id: string, limitGroupId: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId,
})

const g1: LimitGroup = { id: "g1", name: "Group one", limit: 100_000_00 }
const g2: LimitGroup = { id: "g2", name: "Group two", limit: 10_000_00 }

const room = (group: LimitGroup, value: number, held = 0): GroupRoom => ({
	group,
	used: 0,
	available: value + held,
	held,
	room: value,
	level: "within",
	sharedWith: 0,
})

const emptyLedger = (): CardLedger => ({ statements: [], owed: 0, credit: 0 })

const overdueLedger = (): CardLedger => ({
	statements: [
		{
			cardId: "A",
			period: "2026-09",
			closeDate: "2026-09-18",
			dueDate: "2026-10-03",
			purchases: [],
			total: 5_000_00,
			paidAmount: 0,
			payments: [],
			remaining: 5_000_00,
			paid: false,
			open: false,
		},
	],
	owed: 5_000_00,
	credit: 0,
})

const A = card("A", "g1")
const B = card("B", "g1")
const C = card("C", "g2")
const D = card("D", "g2")

interface EntryChange {
	date: string
	entries: Record<string, string[]>
	notes: Record<string, string[]>
}

const side = createRawSnippet(() => ({
	render: () => `<button type="button" data-variant="danger" data-action="delete-draft">Delete draft</button>`,
}))

const readyRow = (c: Card, r: GroupRoom): ReadyRow => ({
	card: c,
	room: r,
	closeDate: "2026-11-18",
	dueDate: "2026-12-03",
	overdue: false,
	billDue: null,
	credit: 0,
})

/** Mounts the step; `set` changes a prop afterwards, as the page would. */
const show = async (props: Record<string, unknown> = {}, opts: { heldA?: number; ledgerA?: CardLedger } = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const r1 = room(g1, 50_000_00, opts.heldA ?? 0)
	const r2 = room(g2, 0)
	const rooms = new Map([
		["A", r1],
		["B", r1],
		["C", r2],
		["D", r2],
	])
	values = new SvelteMap<string, unknown>(
		Object.entries({
			cards: [A, B, C],
			allCards: [],
			groups: [],
			planned: [],
			ready: [A, B, C, D].map((c) => readyRow(c, rooms.get(c.id) as GroupRoom)),
			rooms,
			ledgers: new Map([
				["A", opts.ledgerA ?? emptyLedger()],
				["B", emptyLedger()],
				["C", emptyLedger()],
				["D", emptyLedger()],
			]),
			today: "2026-10-31",
			date: "2026-10-31",
			entries: {},
			notes: {},
			sheet: null,
			...props,
		}),
	)
	const state = values
	const changes: EntryChange[] = []
	const reviews: { date: string }[] = []
	const removes: string[] = []
	const adds: string[] = []
	const sheets: ListSheet[] = []
	const get = <T>(key: string) => state.get(key) as T
	mounted = mount(ListAmounts, {
		target: document.body,
		props: {
			get cards() {
				return get<Card[]>("cards")
			},
			get allCards() {
				return get<Card[]>("allCards")
			},
			get groups() {
				return get<LimitGroup[]>("groups")
			},
			get planned() {
				return get<CardPayment[]>("planned")
			},
			get ready() {
				return get<ReadyRow[]>("ready")
			},
			get rooms() {
				return get<Map<string, GroupRoom>>("rooms")
			},
			get ledgers() {
				return get<Map<string, CardLedger>>("ledgers")
			},
			get today() {
				return get<string>("today")
			},
			get date() {
				return get<string>("date")
			},
			get entries() {
				return get<Record<string, string[]>>("entries")
			},
			get notes() {
				return get<Record<string, string[]>>("notes")
			},
			get sheet() {
				return get<ListSheet>("sheet")
			},
			onsheet: (next: ListSheet) => {
				sheets.push(next)
				state.set("sheet", next)
			},
			side,
			onentrychange: (detail: EntryChange) => changes.push(detail),
			onreview: (detail: { date: string }) => reviews.push(detail),
			// The page puts the card on, or takes it off, the list.
			onremove: (cardId: string) => {
				removes.push(cardId)
				state.set(
					"cards",
					get<Card[]>("cards").filter((c) => c.id !== cardId),
				)
			},
			onadd: (cardId: string) => {
				adds.push(cardId)
				const added = [A, B, C, D].find((c) => c.id === cardId)
				if (added) state.set("cards", [...get<Card[]>("cards"), added])
			},
		},
	})
	await settle()
	return {
		changes,
		reviews,
		removes,
		adds,
		sheets,
		set: async (next: Record<string, unknown>) => {
			for (const [key, value] of Object.entries(next)) state.set(key, value)
			await settle()
		},
	}
}

const root = document.body
const flat = (el: Element | ParentNode | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
/** A card's row on the list. */
const row = (id: string) => root.querySelector(`.lines > button.line[data-card="${id}"]`) as HTMLElement
/** The open sheet's card, or null. */
const step = (id: string) => root.querySelector(`dialog .card-step[data-card="${id}"]`) as HTMLElement
const dateInput = () => root.querySelector('[data-field="date"]') as HTMLInputElement
const reviewButton = () => root.querySelector('[data-action="review"]') as HTMLButtonElement
const footer = () => root.querySelector(".action-bar")

const fill = async (input: HTMLInputElement, text: string) => {
	input.value = text
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}
const click = async (el: Element | null) => {
	;(el as HTMLElement).click()
	await settle()
}

/** Opens a card's sheet, as the page would on a row's tap, unless it is open already. */
const opened = async (id: string) => {
	if (!step(id)) {
		values?.set("sheet", { kind: "card", cardId: id })
		await settle()
	}
	return step(id)
}
const amountInput = async (id: string) => (await opened(id)).querySelector('[data-field="amount"]') as HTMLInputElement
const noteInput = async (id: string) => (await opened(id)).querySelector('[data-field="note"]') as HTMLInputElement
const type = async (id: string, text: string) => fill(await amountInput(id), text)
const typeNote = async (id: string, text: string) => fill(await noteInput(id), text)
const setDate = (value: string) => fill(dateInput(), value)

test("typing shows room after in the sheet and the total in the side panel", async () => {
	const { changes } = await show()
	await type("A", "20,000")
	expect(flat(step("A").querySelector(".after"))).toContain("฿30,000.00")
	expect(flat(footer())).toContain("฿20,000.00")
	expect(changes.at(-1)?.entries["A"]).toEqual(["20,000"])
	expect(changes.at(-1)?.date).toBe("2026-10-31")
	// The row says it too.
	expect(flat(row("A").querySelector(".sum"))).toBe("฿20,000.00")
	expect(flat(row("A").querySelector(".what small"))).toBe("room after ฿30,000.00")
})

test("over the room offers lower to", async () => {
	await show()
	await type("A", "60000")
	const warning = step("A").querySelector('[data-warning="over-room"]')
	expect(flat(warning)).toContain("฿10,000.00")
	const lower = step("A").querySelector('[data-action="lower"]') as HTMLButtonElement
	expect(flat(lower)).toBe("Lower to ฿50,000.00")
	await click(lower)
	expect((await amountInput("A")).value).toBe("50000")
	expect(step("A").querySelector("[data-warning]")).toBeNull()
	expect(row("A").hasAttribute("data-warn")).toBe(false)
})

test("held room is explained", async () => {
	await show({}, { heldA: 10_000_00 })
	await type("A", "60000")
	expect(flat(step("A").querySelector('[data-warning="over-room"]'))).toContain("held by lists waiting for the spender")

	await show({}, { heldA: 0 })
	await type("A", "60000")
	expect(flat(step("A").querySelector('[data-warning="over-room"]'))).not.toContain(
		"held by lists waiting for the spender",
	)
})

test("no lower to when the room is gone", async () => {
	await show()
	await type("C", "100")
	expect(step("C").querySelector('[data-warning="over-room"]')).not.toBeNull()
	expect(step("C").querySelector('[data-action="lower"]')).toBeNull()
})

test("cards sharing a limit are warned together", async () => {
	await show()
	await type("A", "30000")
	await type("B", "30000")
	for (const id of ["A", "B"]) {
		const warning = (await opened(id)).querySelector('[data-warning="shared-limit"]')
		expect(flat(warning)).toContain("Card A, Card B")
	}
})

test("an overdue bill links to the card's panel on Cards", async () => {
	await show({}, { ledgerA: overdueLedger() })
	const link = (await opened("A")).querySelector('[data-warning="overdue-bill"] a') as HTMLAnchorElement
	expect(link.getAttribute("href")).toBe("/cards?card=A")
})

test("buying on the close date is warned", async () => {
	const { changes } = await show()
	await setDate("2026-11-18")
	expect((await opened("A")).querySelector('[data-warning="close-date"]')).not.toBeNull()
	expect(changes.at(-1)?.date).toBe("2026-11-18")
})

test("a past date is warned once, with change to today", async () => {
	await show({ date: "2026-10-30" })
	expect(root.querySelectorAll('[data-warning="date-passed"]').length).toBe(1)
	expect(flat(footer())).toContain("date has passed")
	await click(root.querySelector('[data-action="to-today"]'))
	expect(dateInput().value).toBe("2026-10-31")
	expect(root.querySelector('[data-warning="date-passed"]')).toBeNull()
})

test("an emptied date reads as today", async () => {
	const { changes } = await show({ date: "2026-10-30" })
	await setDate("")
	expect(changes.at(-1)?.date).toBe("2026-10-31")
	expect(root.querySelector('[data-warning="date-passed"]')).toBeNull()
})

test("the summary counts lines with warnings, and each row says how many", async () => {
	await show()
	await type("A", "60000")
	await type("C", "100")
	expect(flat(footer())).toContain("2 lines have warnings")
	expect(row("A").hasAttribute("data-warn")).toBe(true)
	expect(flat(row("A").querySelector(".what small"))).toBe("1 warning")
	expect(row("A").querySelector('.what small[data-tone="warn"]')).not.toBeNull()
	expect(row("B").hasAttribute("data-warn")).toBe(false)
	// Over the room and on the close date: two.
	await setDate("2026-11-18")
	expect(flat(row("A").querySelector(".what small"))).toBe("2 warnings")
})

test("amounts that are not money stop review", async () => {
	await show()
	expect(reviewButton().disabled).toBe(true)
	await type("A", "12.345")
	expect(flat(step("A"))).toContain("Enter the amount in baht, like 1234.56.")
	expect(flat(step("A").querySelector(".after"))).toContain("—")
	expect(flat(row("A").querySelector(".what small"))).toBe("not an amount")
	expect(flat(footer())).not.toContain("NaN")
	expect(reviewButton().disabled).toBe(true)
	await type("A", "")
	expect(reviewButton().disabled).toBe(true)
	await type("A", "100")
	expect(reviewButton().disabled).toBe(false)
})

test("review sends the date", async () => {
	const { reviews } = await show()
	await type("A", "100")
	await click(reviewButton())
	expect(reviews).toEqual([{ date: "2026-10-31" }])
})

test("a row opens its card's sheet, which takes it off the list or closes with Done", async () => {
	const { removes, sheets } = await show({ cards: [A, B] })
	await click(row("A"))
	expect(sheets.at(-1)).toEqual({ kind: "card", cardId: "A" })
	expect(flat(root.querySelector("dialog h2"))).toBe("On the list")
	expect(root.querySelector("dialog")?.hasAttribute("data-wide")).toBe(true)
	expect(step("A").hasAttribute("data-adding")).toBe(false)
	await click(step("A").querySelector('[data-action="done"]'))
	expect(sheets.at(-1)).toBeNull()
	expect(root.querySelector("dialog")).toBeNull()
	await click(row("A"))
	await click(step("A").querySelector('[data-action="remove"]'))
	expect(removes).toEqual(["A"])
	expect(sheets.at(-1)).toBeNull()
	expect(row("A")).toBeNull()
})

test("+ Add a card opens the picker; a picked card is added only by Add to list", async () => {
	const { adds, sheets, changes } = await show({ cards: [A, B] })
	await click(root.querySelector('.list-layout__main [data-action="add-card"]'))
	expect(sheets.at(-1)).toEqual({ kind: "pick" })
	expect(flat(root.querySelector("dialog h2"))).toBe("Add a card")
	// The wide sheet, with the list pages' search box and the sorts always shown.
	expect(root.querySelector("dialog")?.hasAttribute("data-wide")).toBe(true)
	expect(root.querySelector("dialog .tx-controls .tx-search input")).not.toBeNull()
	expect(root.querySelector('dialog [data-action="filter"]')).toBeNull()
	expect(root.querySelectorAll("dialog .filter-chips [data-sort]")).toHaveLength(5)
	const tiles = [...root.querySelectorAll("dialog .tile")].map((t) => t.getAttribute("data-card"))
	expect(tiles.sort()).toEqual(["A", "B", "C", "D"])
	expect(flat(root.querySelector('dialog .tile[data-card="A"] .aside'))).toBe("On the list")
	await click(root.querySelector('dialog .tile[data-card="D"]'))
	expect(sheets.at(-1)).toEqual({ kind: "card", cardId: "D" })
	expect(step("D").hasAttribute("data-adding")).toBe(true)
	expect(row("D")).toBeNull()
	await type("D", "100")
	// Not on the list yet: the total leaves it out.
	expect(flat(footer())).toContain("Total · 2 cards")
	await click(step("D").querySelector('[data-action="add-to-list"]'))
	expect(adds).toEqual(["D"])
	expect(sheets.at(-1)).toBeNull()
	expect(flat(row("D").querySelector(".sum"))).toBe("฿100.00")
	expect(changes.at(-1)?.entries["D"]).toEqual(["100"])
})

test("Add & pick another adds the card and goes back to the picker", async () => {
	const { adds, sheets } = await show({ cards: [A] })
	await opened("D")
	await type("D", "100")
	await click(step("D").querySelector('[data-action="add-next"]'))
	expect(adds).toEqual(["D"])
	expect(sheets.at(-1)).toEqual({ kind: "pick" })
	expect(flat(root.querySelector('dialog .tile[data-card="D"] .aside'))).toBe("On the list · ฿100.00")
})

test("Enter in a card being added adds it and picks another; on the list it closes", async () => {
	const { adds, sheets } = await show({ cards: [A] })
	const input = await amountInput("D")
	input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
	await settle()
	expect(adds).toEqual(["D"])
	expect(sheets.at(-1)).toEqual({ kind: "pick" })
	const onList = await amountInput("A")
	onList.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
	await settle()
	expect(sheets.at(-1)).toBeNull()
})

test("leaving a card's sheet without adding it forgets what was typed for it", async () => {
	const { adds, changes } = await show({ cards: [A] })
	await opened("D")
	await type("D", "500")
	await typeNote("D", "fuel")
	await click(step("D").querySelector('[data-action="to-pick"]'))
	expect(root.querySelector("dialog .tile")).not.toBeNull()
	expect(adds).toEqual([])
	expect(changes.at(-1)?.entries["D"]).toBeUndefined()
	expect(changes.at(-1)?.notes["D"]).toBeUndefined()
	// Picked again, it starts blank.
	expect((await amountInput("D")).value).toBe("")
})

test("a card on the list steps to the one before or after it", async () => {
	const { sheets } = await show({ cards: [A, B, C] })
	await opened("B")
	await click(step("B").querySelector('[data-action="prev-card"]'))
	expect(sheets.at(-1)).toEqual({ kind: "card", cardId: "A" })
	expect((step("A").querySelector('[data-action="prev-card"]') as HTMLButtonElement).disabled).toBe(true)
	await click(step("A").querySelector('[data-action="next-card"]'))
	await click(step("B").querySelector('[data-action="next-card"]'))
	expect(sheets.at(-1)).toEqual({ kind: "card", cardId: "C" })
	expect((step("C").querySelector('[data-action="next-card"]') as HTMLButtonElement).disabled).toBe(true)
	expect(step("C").querySelector('[data-action="next-card"]')?.getAttribute("aria-label")).toBe("Next card on the list")
	// A card being added has no neighbours; it has the way back to the cards instead.
	await opened("D")
	expect(step("D").querySelector('[data-action="prev-card"]')).toBeNull()
	expect(step("D").querySelector('[data-action="to-pick"]')).not.toBeNull()
})

test("a card's sheet shows its dates and its last 12 statements", async () => {
	await show()
	const sheet = await opened("A")
	expect(flat(sheet.querySelector(".card-title small"))).toBe("closes 18 Nov · due 3 Dec")
	expect(sheet.querySelectorAll(".usage .chart li")).toHaveLength(12)
	expect(flat(sheet.querySelector(".usage .stats"))).toContain("Room now ฿50,000.00")
})

test("an empty list is one button to add the first card", async () => {
	const { sheets } = await show({ cards: [] })
	const empty = root.querySelector(".empty-add") as HTMLButtonElement
	expect(flat(empty)).toContain("+ Add a card")
	expect(flat(empty)).toContain("No cards on this list yet.")
	await click(empty)
	expect(sheets.at(-1)).toEqual({ kind: "pick" })
})

test("starting values and a language switch keep what was typed", async () => {
	await show({ entries: { A: ["123"] }, date: "2026-11-02" })
	expect((await amountInput("A")).value).toBe("123")
	expect(dateInput().value).toBe("2026-11-02")
	await type("B", "5")
	setLocale("th")
	await settle()
	expect((await amountInput("A")).value).toBe("123")
	expect((await amountInput("B")).value).toBe("5")
	expect(flat(step("B"))).toContain("วงเงินเหลือหลังซื้อ")
})

test("a parent re-render keeps what was typed; a changed prop refills its field", async () => {
	const { set } = await show({ entries: { A: ["123"] }, notes: { A: ["office"] } })
	await type("A", "456")
	await typeNote("A", "fuel")
	await setDate("2026-11-05")
	// The page hands fresh copies of the same values, and new data around them.
	await set({
		entries: { A: ["123"] },
		notes: { A: ["office"] },
		date: "2026-10-31",
		rooms: new Map(),
		ledgers: new Map(),
	})
	expect((await amountInput("A")).value).toBe("456")
	expect((await noteInput("A")).value).toBe("fuel")
	expect(dateInput().value).toBe("2026-11-05")
	await set({ entries: { A: ["789"] }, notes: { A: ["van"] }, date: "2026-11-09" })
	expect((await amountInput("A")).value).toBe("789")
	expect((await noteInput("A")).value).toBe("van")
	expect(dateInput().value).toBe("2026-11-09")
})

test("the total counts one card or many", async () => {
	await show({ cards: [A] })
	expect(flat(footer())).toContain("Total · 1 card")
	await show({ cards: [A, B] })
	expect(flat(footer())).toContain("Total · 2 cards")
})

test("a row names the card in the panel form, its total or that it has none yet", async () => {
	await show({ cards: [A, B], groups: [{ ...g1, color: "teal" }], entries: { A: ["100"] } })
	expect(flat(row("A").querySelector(".card-label"))).toBe("A) Card A")
	expect(flat(row("A").querySelector(".mini"))).toBe("1111")
	expect(row("A").querySelector(".mini")?.getAttribute("data-g")).toBe("teal")
	expect(flat(row("B").querySelector(".sum"))).toBe("No amount yet")
	expect(row("B").querySelector(".sum")?.hasAttribute("data-blank")).toBe(true)
})

test("the date, summary and Review sit in the side panel, the rows in the main column", async () => {
	await show({ cards: [A, B] })
	const main = root.querySelector(".list-layout > .list-layout__main")
	const sidePanel = root.querySelector(".list-layout > .list-layout__side")
	expect(main?.querySelectorAll(".row-panel.lines > button.line")).toHaveLength(2)
	expect(main?.querySelector('[data-action="add-card"]')).toBeInstanceOf(HTMLElement)
	expect(sidePanel?.querySelector('.when[data-place="start"] [data-field="date"]')).toBeInstanceOf(HTMLElement)
	expect(sidePanel?.querySelector(".action-bar .total")).toBeInstanceOf(HTMLElement)
	expect(sidePanel?.querySelector('[data-action="review"]')).toBeInstanceOf(HTMLElement)
})

test("the side panel takes the page's own actions after Review", async () => {
	await show()
	const own = root.querySelector('.list-layout__side > [data-action="delete-draft"]')
	expect(own).toBeInstanceOf(HTMLElement)
	expect(own?.previousElementSibling?.classList.contains("action-bar")).toBe(true)
})

test("the over-room note shows planned payments due by the list date", async () => {
	const plan = (id: string, cardId: string, date: string, amount: number): CardPayment => ({
		id,
		cardId,
		date,
		amount,
		status: "planned",
	})
	await show({
		allCards: [A, B, C],
		cards: [A],
		planned: [
			plan("p1", "B", "2026-10-31", 3_000_00),
			plan("p2", "A", "2026-12-01", 9_000_00),
			plan("p3", "C", "2026-10-31", 7_000_00),
		],
	})
	await type("A", "60,000")
	const part = step("A").querySelector('[data-part="planned"]')
	expect(flat(part)).toBe("฿3,000.00 planned to be paid by then")
})

test("no planned note when nothing is planned by then", async () => {
	await show()
	await type("A", "60,000")
	expect(step("A").querySelector('[data-part="planned"]')).toBeNull()
})

test("each card has an optional Note under its amount, sent with the entries and shown on its row", async () => {
	const { changes } = await show({ cards: [A, B] })
	const label = (await noteInput("A")).closest("label")
	expect(flat(label)).toBe("Note (optional)")
	// The note follows the amount.
	const fields = [...step("A").querySelectorAll(".order [data-field]")].map(
		(el) => (el as HTMLElement).dataset["field"],
	)
	expect(fields).toEqual(["amount", "note"])
	await type("A", "100")
	await type("B", "50")
	await typeNote("A", " fuel ")
	expect(changes.at(-1)).toEqual({ date: "2026-10-31", entries: { A: ["100"], B: ["50"] }, notes: { A: [" fuel "] } })
	expect(flat(row("A").querySelector(".what small"))).toBe("room after ฿49,850.00 · fuel")
})

test("starting notes show, and a language switch keeps a typed note", async () => {
	await show({ cards: [A, B], notes: { A: ["office"] } })
	expect((await noteInput("A")).value).toBe("office")
	await typeNote("B", "van fuel")
	setLocale("th")
	await settle()
	expect((await noteInput("A")).value).toBe("office")
	expect((await noteInput("B")).value).toBe("van fuel")
	expect(flat((await noteInput("B")).closest("label"))).toBe("หมายเหตุ (ไม่บังคับ)")
})

test("each amount and note box is named for its card", async () => {
	await show()
	expect((await noteInput("B")).getAttribute("aria-label")).toBe("Note for Card B")
	expect((await amountInput("B")).getAttribute("aria-label")).toContain("Card B")
	setLocale("th")
	await settle()
	expect((await noteInput("B")).getAttribute("aria-label")).toBe("หมายเหตุของ Card B")
})

/** The amount boxes of a card's orders, in order. */
const amountsOf = (id: string) => [...step(id).querySelectorAll<HTMLInputElement>('[data-field="amount"]')]
const notesOf = (id: string) => [...step(id).querySelectorAll<HTMLInputElement>('[data-field="note"]')]
const addOrder = async (id: string) => click((await opened(id)).querySelector('[data-action="add-order"]'))

test("a card with one order shows no order heading and no Remove order", async () => {
	await show({ cards: [A] })
	await opened("A")
	expect(amountsOf("A")).toHaveLength(1)
	expect(step("A").querySelector(".order-head")).toBeNull()
	expect(step("A").querySelector('[data-action="remove-order"]')).toBeNull()
	expect(flat(step("A").querySelector('[data-action="add-order"]'))).toBe("+ Add order")
})

test("Add order puts another amount and note in the card's sheet, and the row counts them", async () => {
	const { changes } = await show()
	await type("A", "100")
	await addOrder("A")
	expect(amountsOf("A")).toHaveLength(2)
	expect(notesOf("A")).toHaveLength(2)
	expect(document.activeElement).toBe(amountsOf("A")[1])
	expect([...step("A").querySelectorAll(".order-head")].map((el) => flat(el.querySelector("span")))).toEqual([
		"Order 1",
		"Order 2",
	])
	await fill(amountsOf("A")[1] as HTMLInputElement, "200")
	await fill(notesOf("A")[1] as HTMLInputElement, "tyres")
	expect(changes.at(-1)?.entries["A"]).toEqual(["100", "200"])
	expect(changes.at(-1)?.notes["A"]).toEqual(["", "tyres"])
	// Room after and the total count every order on the card.
	expect(flat(step("A").querySelector(".after"))).toContain("฿49,700.00")
	expect(flat(footer())).toContain("Total · 3 cards · 4 orders")
	expect(flat(footer())).toContain("฿300.00")
	expect(flat(row("A").querySelector(".what small"))).toBe("2 orders · room after ฿49,700.00 · tyres")
	expect(flat(row("A").querySelector(".sum"))).toBe("฿300.00")
})

test("starting orders show, and Remove order drops only that one", async () => {
	const { changes } = await show({ entries: { A: ["100", "200", "300"] }, notes: { A: ["a", "b", "c"] } })
	await opened("A")
	expect(amountsOf("A").map((input) => input.value)).toEqual(["100", "200", "300"])
	const removes = step("A").querySelectorAll('[data-action="remove-order"]')
	expect(removes).toHaveLength(3)
	await click(removes[1] as Element)
	expect(amountsOf("A").map((input) => input.value)).toEqual(["100", "300"])
	expect(notesOf("A").map((input) => input.value)).toEqual(["a", "c"])
	expect(changes.at(-1)?.entries["A"]).toEqual(["100", "300"])
	expect(changes.at(-1)?.notes["A"]).toEqual(["a", "c"])
	await click(step("A").querySelector('[data-action="remove-order"]'))
	expect(amountsOf("A").map((input) => input.value)).toEqual(["300"])
	expect(step("A").querySelector('[data-action="remove-order"]')).toBeNull()
})

test("a card's orders are warned as one, with no Lower to", async () => {
	await show({ entries: { A: ["30000", "30000"] } })
	await opened("A")
	expect(flat(step("A").querySelector('[data-warning="over-room"]'))).toContain("฿10,000.00")
	expect(step("A").querySelector('[data-action="lower"]')).toBeNull()
	expect(step("A").querySelectorAll('[data-warning="over-room"]')).toHaveLength(1)
})

test("an order that is not money stops review and says so under it", async () => {
	await show({ entries: { A: ["100", "1.234"] } })
	expect(reviewButton().disabled).toBe(true)
	const orders = (await opened("A")).querySelectorAll(".order")
	expect(orders[0]?.querySelector(".error")).toBeNull()
	expect(flat(orders[1]?.querySelector(".error"))).toBe("Enter the amount in baht, like 1234.56.")
})

test("each order's boxes and Remove are named for the card and the order", async () => {
	await show({ entries: { A: ["1", "2"] } })
	await opened("A")
	expect(amountsOf("A")[1]?.getAttribute("aria-label")).toBe("Amount for Card A, order 2")
	expect(notesOf("A")[1]?.getAttribute("aria-label")).toBe("Note for Card A, order 2")
	const remove = step("A").querySelectorAll('[data-action="remove-order"]')[1]
	expect(remove?.getAttribute("aria-label")).toBe("Remove order 2 of Card A")
	// An × icon, so it never reads as a second Remove beside the card's own.
	expect(flat(remove)).toBe("")
	expect(remove?.querySelector("svg")).not.toBeNull()
	expect(flat(step("A").querySelector('[data-action="remove"]'))).toBe("Remove from list")
	setLocale("th")
	await settle()
	expect(amountsOf("A")[1]?.getAttribute("aria-label")).toBe("จำนวนเงินของ Card A รายการที่ 2")
	expect(flat(step("A").querySelector('[data-action="add-order"]'))).toBe("+ เพิ่มรายการ")
})

test("the layout, the side panel and the row panel are app.css's, not a local copy", async () => {
	const source = await Bun.file(`${import.meta.dirname}/../../../src/components/organisms/ListAmounts.svelte`).text()
	const app = await Bun.file(`${import.meta.dirname}/../../../src/styles/app.css`).text()
	expect(app).toContain("grid-template-columns: minmax(0, 1fr) var(--cc-side-panel)")
	expect(source).not.toContain("grid-template-columns: minmax(0, 1fr) var(--cc-side-panel)")
	// The rows sit in app.css's row panel; no panel surface of their own.
	expect(source).toContain('class="row-panel lines"')
	expect(source).not.toMatch(/\.lines\s*\{[^}]*background/)
})
