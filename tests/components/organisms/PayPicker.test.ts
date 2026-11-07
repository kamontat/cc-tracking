import type { PayChoice } from "#lib/domain/pay"
import type { GroupRoom } from "#lib/domain/room"
import type { Card, CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import PayPicker from "#components/organisms/PayPicker.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The payment sheet's first step: every card a payment can go to, as card tiles, with a search
 * box. Ported from the legacy `cc-pay-picker` tests, against the same markup.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const card = (id: string, name: string, last4 = "1234"): Card => ({
	id,
	name,
	last4,
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
})

const bill = (dueDate: string) => ({
	period: "2026-09",
	cardId: "x",
	closeDate: "2026-09-25",
	dueDate,
	total: 120_00,
	paidAmount: 0,
	remaining: 120_00,
	parts: [],
	open: false,
})

const choices = (): PayChoice[] =>
	[
		{ card: card("A", "Alpha"), owed: 500_00, credit: 0, bill: bill("2026-10-28"), urgency: "overdue", days: 3 },
		{ card: card("B", "Beta", "9999"), owed: 200_00, credit: 0, bill: bill("2026-11-02"), urgency: "soon", days: 2 },
		{ card: card("C", "Gamma"), owed: 100_00, credit: 0, bill: bill("2026-11-20"), urgency: "due", days: 20 },
		{ card: card("D", "Delta"), owed: 0, credit: 50_00, bill: null, urgency: "none", days: 0 },
		{ card: card("E", "Echo"), owed: 0, credit: 0, bill: null, urgency: "none", days: 0 },
	] as unknown as PayChoice[]

type Props = {
	choices: PayChoice[]
	groups: LimitGroup[]
	rooms: Map<string, GroupRoom>
	ledgers: Map<string, CardLedger>
	today: PlainDate
	total: number
	onpick: (detail: { cardId: string }) => void
}

const show = (props: Partial<Props> = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	setLocale("en")
	mounted = mount(PayPicker, { target: document.body, props: { choices: choices(), ...props } })
	flushSync()
	return document.body.querySelector(".pay-picker") as HTMLElement
}

const room = (used: number, limit = 1_000_00): GroupRoom => ({
	group: { id: "g1", name: "One", limit, color: "rose" },
	used,
	available: limit - used,
	held: 0,
	room: limit - used,
	level: "within",
	sharedWith: 0,
})

const tiles = (props: Partial<Props> = {}) =>
	show({
		groups: [
			{ id: "g0", name: "Zero", limit: 1, color: "blue" },
			{ id: "g1", name: "One", limit: 1_000_00, color: "rose" },
		],
		rooms: new Map([["g1", room(500_00)]]),
		choices: choices().map((c, i) => (i === 0 ? { ...c, card: { ...c.card, limitGroupId: "g1" } } : c)),
		...props,
	})

const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>("button[data-card]")]
const flat = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("rows keep the given order, under the hint, and a tap picks the card", () => {
	const picked: string[] = []
	const el = show({ onpick: ({ cardId }) => picked.push(cardId) })
	expect(flat(el.querySelector(".hint"))).toBe("Which card is it for? Overdue and soon-due cards come first.")
	expect(rows(el).map((r) => r.dataset["card"])).toEqual(["A", "B", "C", "D", "E"])
	rows(el)[1]?.click()
	expect(picked).toEqual(["B"])
})

test("each card is one tile button with data-card, in one tiles grid", () => {
	const el = tiles()
	expect(el.querySelectorAll(".tiles")).toHaveLength(1)
	expect(el.querySelectorAll('.tiles > button.tile[type="button"][data-card]')).toHaveLength(choices().length)
	expect(el.querySelector(".panel")).toBeNull()
})

test("line 1 is id) name and the last 4 in the group's colour", () => {
	const [a, b] = rows(tiles())
	expect(flat(a?.querySelector(".name"))).toBe("A) Alpha")
	expect(flat(a?.querySelector(".corner"))).toBe("•••• 1234")
	expect(a?.querySelector(".corner")?.hasAttribute("data-mono")).toBe(true)
	expect(a?.getAttribute("data-g")).toBe("rose")
	expect(b?.hasAttribute("data-g")).toBe(false)
})

test("line 2 says what is owed, or the credit, or nothing owed; the aside the urgency", () => {
	const el = tiles()
	const line = (i: number) => flat(rows(el)[i]?.querySelector(".room"))
	const aside = (i: number) => rows(el)[i]?.querySelector(".aside")
	expect(line(0)).toBe("฿500.00 owed")
	expect(flat(rows(el)[0]?.querySelector(".room b"))).toBe("฿500.00")
	expect(line(1)).toBe("฿200.00 owed")
	expect(line(2)).toBe("฿100.00 owed")
	expect(line(3)).toBe("Credit ฿50.00")
	expect(line(4)).toBe("Nothing owed")
	expect(flat(aside(0))).toBe("Overdue 3 days")
	expect(aside(0)?.getAttribute("data-tone")).toBe("bad")
	expect(flat(aside(1))).toBe("Due in 2 days")
	expect(aside(1)?.getAttribute("data-tone")).toBe("warn")
	expect(flat(aside(2))).toBe("Due 20 Nov 2026")
	expect(aside(2)?.hasAttribute("data-tone")).toBe(false)
	expect(aside(3)).toBeNull()
	expect(aside(4)).toBeNull()
	// A card with no group still says what it owes, never "No limit group".
	expect(el.textContent).not.toContain("No limit group")
})

test("line 3 is the bill the payment goes to, else when the open statement closes and is due", () => {
	// F's open statement keeps its own dates; the others fall back to the card's cycle.
	const ledgers = new Map([
		[
			"F",
			{
				statements: [{ ...bill("2026-12-08"), period: "2026-11", cardId: "F", closeDate: "2026-11-18", open: true }],
				owed: 300_00,
				credit: 0,
			},
		],
	]) as unknown as Map<string, CardLedger>
	const el = tiles({
		today: "2026-11-04",
		ledgers,
		choices: [
			...choices(),
			{ card: card("F", "Foxtrot"), owed: 300_00, credit: 0, bill: null, urgency: "none", days: 0 } as PayChoice,
		],
	})
	const facts = (i: number) => flat(rows(el)[i]?.querySelector(".facts"))
	expect(facts(0)).toBe("Bill closed 25 Sep 2026 · ฿120.00 left")
	expect(facts(3)).toBe("closes 25 Nov 2026 · due 15 Dec 2026")
	expect(facts(4)).toBe("closes 25 Nov 2026 · due 15 Dec 2026")
	expect(facts(5)).toBe("closes 18 Nov 2026 · due 08 Dec 2026")
	expect(el.textContent).not.toContain("so far")
})

test("the rail shows the group's used share; a card with no group has none", () => {
	const [a, b] = rows(tiles())
	expect(a?.querySelector(".rail")?.getAttribute("aria-label")).toBe("50% of the limit used")
	expect(b?.querySelector(".rail")).toBeNull()
})

test("a tile is named by the card and what it owes, and a tap picks it", () => {
	const picked: string[] = []
	const el = tiles({ onpick: ({ cardId }) => picked.push(cardId) })
	expect(rows(el)[0]?.getAttribute("aria-label")).toBe("Alpha, ฿500.00 owed")
	rows(el)[2]?.click()
	expect(picked).toEqual(["C"])
})

test("search narrows the rows, and an empty result says what to do", () => {
	const el = show()
	const input = el.querySelector<HTMLInputElement>('input[type="search"]')
	if (!input) throw new Error("no search")
	expect(input.getAttribute("aria-label")).toBe("Search card")
	expect(input.getAttribute("placeholder")).toBe("Search card")
	input.value = "9999"
	input.dispatchEvent(new Event("input"))
	flushSync()
	expect(rows(el).map((r) => r.dataset["card"])).toEqual(["B"])
	input.value = "zzz"
	input.dispatchEvent(new Event("input", { bubbles: true }))
	flushSync()
	expect(rows(el)).toHaveLength(0)
	expect(flat(el.querySelector(".empty"))).toBe("No card matches. Clear the search.")
})

test("with no cards at all it says to add one, linking to Cards", () => {
	const el = show({ choices: [] })
	const empty = el.querySelector('.empty[data-empty="no-cards"]')
	expect(flat(empty)).toBe("No cards yet. Add one on the Cards page.")
	expect(empty?.querySelector("a")?.getAttribute("href")).toBe("/cards")
	expect(el.querySelector(".hint")).toBeNull()
	expect(el.querySelector('input[type="search"]')).toBeNull()
})

test("with cards stored but none to pay, says archived paid-off cards are hidden", () => {
	const el = show({ choices: [], total: 2 })
	expect(flat(el)).toBe("No card to pay. Archived cards with nothing owed are hidden.")
	expect(el.querySelector('.empty[data-empty="archived"]')).not.toBeNull()
	expect(flat(show({ choices: [], total: 0 }))).toBe("No cards yet. Add one on the Cards page.")
})

test("a language switch re-renders the tiles and the box in place", () => {
	const el = tiles()
	const before = rows(el)[0]
	setLocale("th")
	flushSync()
	expect(rows(el)[0]).toBe(before)
	expect(flat(el.querySelector(".hint"))).not.toBe("Which card is it for? Overdue and soon-due cards come first.")
	expect(rows(el)[0]?.getAttribute("aria-label")).not.toMatch(/owed/)
	expect(flat(rows(el)[3]?.querySelector(".facts"))).not.toMatch(/closes/)
	expect(el.querySelector('input[type="search"]')?.getAttribute("placeholder")).not.toBe("Search card")
})

test("the picker draws card tiles, not a row panel", async () => {
	const source = await Bun.file("src/components/organisms/PayPicker.svelte").text()
	expect(source).toContain('import CardTile from "#components/molecules/CardTile.svelte"')
	expect(source).toMatch(/\.tiles\s*\{[^}]*display:\s*grid/)
	expect(source).not.toMatch(/row-panel|rowPanel/)
	expect(source).not.toContain("button[data-card]")
})
