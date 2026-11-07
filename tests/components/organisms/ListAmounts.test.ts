import type { GroupRoom } from "#lib/domain/room"
import type { Card, CardLedger, CardPayment, LimitGroup } from "#lib/domain/types"

import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import ListAmounts from "#components/organisms/ListAmounts.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The purchase list's amounts step. Ported from the legacy `cc-list-amounts` tests, against the
 * same markup; the events are the callbacks.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
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

interface EntryChange {
	date: string
	entries: Record<string, string>
	notes: Record<string, string>
}

const side = createRawSnippet(() => ({
	render: () => `<button type="button" data-variant="danger" data-action="delete-draft">Delete draft</button>`,
}))

/** Mounts the step; `set` changes a prop afterwards, as the page would. */
const show = async (props: Record<string, unknown> = {}, opts: { heldA?: number; ledgerA?: CardLedger } = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	const r1 = room(g1, 50_000_00, opts.heldA ?? 0)
	const values = new SvelteMap<string, unknown>(
		Object.entries({
			cards: [A, B, C],
			allCards: [],
			groups: [],
			planned: [],
			candidates: [],
			rooms: new Map([
				["A", r1],
				["B", r1],
				["C", room(g2, 0)],
			]),
			ledgers: new Map([
				["A", opts.ledgerA ?? emptyLedger()],
				["B", emptyLedger()],
				["C", emptyLedger()],
			]),
			today: "2026-10-31",
			date: "2026-10-31",
			entries: {},
			notes: {},
			...props,
		}),
	)
	const changes: EntryChange[] = []
	const reviews: { date: string }[] = []
	const removes: string[] = []
	const adds: string[] = []
	const get = <T>(key: string) => values.get(key) as T
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
			get candidates() {
				return get<Card[]>("candidates")
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
				return get<Record<string, string>>("entries")
			},
			get notes() {
				return get<Record<string, string>>("notes")
			},
			side,
			onentrychange: (detail: EntryChange) => changes.push(detail),
			onreview: (detail: { date: string }) => reviews.push(detail),
			onremove: (cardId: string) => removes.push(cardId),
			onadd: (cardId: string) => adds.push(cardId),
		},
	})
	await settle()
	return {
		changes,
		reviews,
		removes,
		adds,
		set: async (next: Record<string, unknown>) => {
			for (const [key, value] of Object.entries(next)) values.set(key, value)
			await settle()
		},
	}
}

const root = document.body
const flat = (el: Element | ParentNode | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const line = (id: string) => root.querySelector(`section.line[data-card="${id}"]`) as HTMLElement
const amountInput = (id: string) => line(id).querySelector('[data-field="amount"]') as HTMLInputElement
const noteInput = (id: string) => line(id).querySelector('[data-field="note"]') as HTMLInputElement
const dateInput = () => root.querySelector('[data-field="date"]') as HTMLInputElement
const reviewButton = () => root.querySelector('[data-action="review"]') as HTMLButtonElement
const footer = () => root.querySelector(".action-bar")

const fill = async (input: HTMLInputElement, text: string) => {
	input.value = text
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}
const type = (id: string, text: string) => fill(amountInput(id), text)
const typeNote = (id: string, text: string) => fill(noteInput(id), text)
const setDate = (value: string) => fill(dateInput(), value)
const click = async (el: Element | null) => {
	;(el as HTMLElement).click()
	await settle()
}

test("typing shows room after and the total", async () => {
	const { changes } = await show()
	await type("A", "20,000")
	expect(flat(line("A").querySelector(".after"))).toContain("฿30,000.00")
	expect(flat(footer())).toContain("฿20,000.00")
	expect(changes.at(-1)?.entries["A"]).toBe("20,000")
	expect(changes.at(-1)?.date).toBe("2026-10-31")
})

test("over the room offers lower to", async () => {
	await show()
	await type("A", "60000")
	const warning = line("A").querySelector('[data-warning="over-room"]')
	expect(flat(warning)).toContain("฿10,000.00")
	const lower = line("A").querySelector('[data-action="lower"]') as HTMLButtonElement
	expect(flat(lower)).toBe("Lower to ฿50,000.00")
	await click(lower)
	expect(amountInput("A").value).toBe("50000")
	expect(line("A").querySelector("[data-warning]")).toBeNull()
	expect(line("A").hasAttribute("data-warn")).toBe(false)
})

test("held room is explained", async () => {
	await show({}, { heldA: 10_000_00 })
	await type("A", "60000")
	expect(flat(line("A").querySelector('[data-warning="over-room"]'))).toContain("held by lists waiting for the spender")

	await show({}, { heldA: 0 })
	await type("A", "60000")
	expect(flat(line("A").querySelector('[data-warning="over-room"]'))).not.toContain(
		"held by lists waiting for the spender",
	)
})

test("no lower to when the room is gone", async () => {
	await show()
	await type("C", "100")
	expect(line("C").querySelector('[data-warning="over-room"]')).not.toBeNull()
	expect(line("C").querySelector('[data-action="lower"]')).toBeNull()
})

test("cards sharing a limit are warned together", async () => {
	await show()
	await type("A", "30000")
	await type("B", "30000")
	for (const id of ["A", "B"]) {
		const warning = line(id).querySelector('[data-warning="shared-limit"]')
		expect(flat(warning)).toContain("Card A, Card B")
	}
})

test("an overdue bill links to the card", async () => {
	await show({}, { ledgerA: overdueLedger() })
	const link = line("A").querySelector('[data-warning="overdue-bill"] a') as HTMLAnchorElement
	expect(link.getAttribute("href")).toBe("/card?id=A")
})

test("buying on the close date is warned", async () => {
	const { changes } = await show()
	await setDate("2026-11-18")
	expect(line("A").querySelector('[data-warning="close-date"]')).not.toBeNull()
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

test("the summary counts lines with warnings", async () => {
	await show()
	await type("A", "60000")
	await type("C", "100")
	expect(flat(footer())).toContain("2 lines have warnings")
})

test("amounts that are not money stop review", async () => {
	await show()
	expect(reviewButton().disabled).toBe(true)
	await type("A", "12.345")
	expect(flat(line("A"))).toContain("Enter the amount in baht, like 1234.56.")
	expect(flat(line("A").querySelector(".after"))).toContain("—")
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

test("remove and add", async () => {
	const { removes, adds } = await show({ cards: [A, B], candidates: [C] })
	await click(line("A").querySelector('[data-action="remove"]'))
	expect(removes).toEqual(["A"])
	expect(root.querySelector(".picker")).toBeNull()
	const add = root.querySelector('[data-action="add-card"]') as HTMLButtonElement
	expect(add.getAttribute("aria-expanded")).toBe("false")
	await click(add)
	expect(add.getAttribute("aria-expanded")).toBe("true")
	const pick = root.querySelector('.picker [data-card="C"]') as HTMLButtonElement
	expect(flat(pick)).toBe("1111C) Card C")
	expect(flat(pick.querySelector(".mini"))).toBe("1111")
	expect(pick.closest(".panel")).toBe(root.querySelector(".picker.panel"))
	expect(root.querySelectorAll(".picker button[data-card]")).toHaveLength(1)
	await click(pick)
	expect(adds).toEqual(["C"])
})

test("an empty list says so", async () => {
	await show({ cards: [] })
	expect(flat(root)).toContain("No cards on this list yet. Add one below.")
})

test("starting values and a language switch keep what was typed", async () => {
	await show({ entries: { A: "123" }, date: "2026-11-02" })
	expect(amountInput("A").value).toBe("123")
	expect(dateInput().value).toBe("2026-11-02")
	await type("B", "5")
	setLocale("th")
	await settle()
	expect(amountInput("A").value).toBe("123")
	expect(amountInput("B").value).toBe("5")
	expect(flat(line("A"))).toContain("วงเงินเหลือหลังซื้อ")
})

test("a parent re-render keeps what was typed; a changed prop refills its field", async () => {
	const { set } = await show({ entries: { A: "123" }, notes: { A: "office" } })
	await type("A", "456")
	await typeNote("A", "fuel")
	await setDate("2026-11-05")
	// The page hands fresh copies of the same values, and new data around them.
	await set({ entries: { A: "123" }, notes: { A: "office" }, date: "2026-10-31", rooms: new Map(), ledgers: new Map() })
	expect(amountInput("A").value).toBe("456")
	expect(noteInput("A").value).toBe("fuel")
	expect(dateInput().value).toBe("2026-11-05")
	await set({ entries: { A: "789" }, notes: { A: "van" }, date: "2026-11-09" })
	expect(amountInput("A").value).toBe("789")
	expect(noteInput("A").value).toBe("van")
	expect(dateInput().value).toBe("2026-11-09")
})

test("the total counts one card or many", async () => {
	await show({ cards: [A] })
	expect(flat(footer())).toContain("Total · 1 card")
	await show({ cards: [A, B] })
	expect(flat(footer())).toContain("Total · 2 cards")
})

test("a line is headed by the card in the panel form, Remove beside it", async () => {
	await show({ cards: [A], groups: [{ ...g1, color: "teal" }] })
	const top = line("A").querySelector(".top")
	expect(flat(top?.querySelector(".card-panel .card-label"))).toBe("A) Card A")
	expect(flat(top?.querySelector(".card-panel .mini"))).toBe("1111")
	expect(top?.querySelector(".mini")?.getAttribute("data-g")).toBe("teal")
	expect(top?.querySelector('[data-action="remove"]')).not.toBeNull()
})

test("the date, summary and Review sit in the side panel, the lines in the main column", async () => {
	await show({ cards: [A, B] })
	const main = root.querySelector(".list-layout > .list-layout__main")
	const sidePanel = root.querySelector(".list-layout > .list-layout__side")
	expect(main?.querySelectorAll(".lines > section.line")).toHaveLength(2)
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
	const part = line("A").querySelector('[data-part="planned"]')
	expect(flat(part)).toBe("฿3,000.00 planned to be paid by then")
})

test("no planned note when nothing is planned by then", async () => {
	await show()
	await type("A", "60,000")
	expect(line("A").querySelector('[data-part="planned"]')).toBeNull()
})

test("each line has an optional Note under its amount, sent with the entries", async () => {
	const { changes } = await show({ cards: [A, B] })
	const label = noteInput("A").closest("label")
	expect(flat(label)).toBe("Note (optional)")
	// The note follows the amount in the line.
	const fields = [...line("A").querySelectorAll("[data-field]")].map((el) => (el as HTMLElement).dataset["field"])
	expect(fields).toEqual(["amount", "note"])
	await type("A", "100")
	await type("B", "50")
	await typeNote("A", " fuel ")
	expect(changes.at(-1)).toEqual({ date: "2026-10-31", entries: { A: "100", B: "50" }, notes: { A: " fuel " } })
})

test("starting notes show, and a language switch keeps a typed note", async () => {
	await show({ cards: [A, B], notes: { A: "office" } })
	expect(noteInput("A").value).toBe("office")
	await typeNote("B", "van fuel")
	setLocale("th")
	await settle()
	expect(noteInput("A").value).toBe("office")
	expect(noteInput("B").value).toBe("van fuel")
	expect(flat(noteInput("B").closest("label"))).toBe("หมายเหตุ (ไม่บังคับ)")
})

test("each amount and note box is named for its card", async () => {
	await show()
	expect(noteInput("B").getAttribute("aria-label")).toBe("Note for Card B")
	expect(amountInput("B").getAttribute("aria-label")).toContain("Card B")
	setLocale("th")
	await settle()
	expect(noteInput("B").getAttribute("aria-label")).toBe("หมายเหตุของ Card B")
})

test("the layout and the side panel are app.css's, not a local copy", async () => {
	const source = await Bun.file(`${import.meta.dirname}/../../../src/components/organisms/ListAmounts.svelte`).text()
	const app = await Bun.file(`${import.meta.dirname}/../../../src/styles/app.css`).text()
	expect(app).toContain("grid-template-columns: minmax(0, 1fr) var(--cc-side-panel)")
	expect(source).not.toContain("grid-template-columns: minmax(0, 1fr) var(--cc-side-panel)")
	expect(source.split(".line {")).toHaveLength(2)
})
