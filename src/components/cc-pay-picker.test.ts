import { expect, test } from "vitest"
import "#components/cc-pay-picker"
import type { PayChoice } from "#lib/domain/pay"
import type { GroupRoom } from "#lib/domain/room"
import type { Card } from "#lib/domain/types"

import { CcPayPicker, type PickDetail } from "#components/cc-pay-picker"
import { setLocale } from "#lib/i18n/index"
import { rowPanel } from "#styles/shared"
import { cardTileStyles } from "./card-tile"

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
		{
			card: card("A", "Alpha"),
			owed: 500_00,
			credit: 0,
			bill: bill("2026-10-28"),
			urgency: "overdue",
			days: 3,
		},
		{
			card: card("B", "Beta", "9999"),
			owed: 200_00,
			credit: 0,
			bill: bill("2026-11-02"),
			urgency: "soon",
			days: 2,
		},
		{
			card: card("C", "Gamma"),
			owed: 100_00,
			credit: 0,
			bill: bill("2026-11-20"),
			urgency: "due",
			days: 20,
		},
		{
			card: card("D", "Delta"),
			owed: 0,
			credit: 50_00,
			bill: null,
			urgency: "none",
			days: 0,
		},
		{
			card: card("E", "Echo"),
			owed: 0,
			credit: 0,
			bill: null,
			urgency: "none",
			days: 0,
		},
	] as unknown as PayChoice[]

const mount = async () => {
	setLocale("en")
	document.body.innerHTML = ""
	const element = document.createElement("cc-pay-picker")
	element.choices = choices()
	document.body.append(element)
	await element.updateComplete
	return element
}

const rows = (el: HTMLElement) => [...(el.shadowRoot?.querySelectorAll<HTMLButtonElement>("button[data-card]") ?? [])]
const flat = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("rows keep the given order, under the hint, and a tap picks the card", async () => {
	const el = await mount()
	expect(flat(el.shadowRoot?.querySelector(".hint"))).toBe(
		"Which card is it for? Overdue and soon-due cards come first.",
	)
	expect(rows(el).map((r) => r.dataset["card"])).toEqual(["A", "B", "C", "D", "E"])
	const picked: string[] = []
	el.addEventListener("pick", (e) => picked.push((e as CustomEvent<PickDetail>).detail.cardId))
	rows(el)[1]?.click()
	expect(picked).toEqual(["B"])
})

const room = (used: number, limit = 1_000_00): GroupRoom => ({
	group: { id: "g1", name: "One", limit, color: "rose" },
	used,
	available: limit - used,
	held: 0,
	room: limit - used,
	level: "within",
	sharedWith: 0,
})

const tiles = async () => {
	const el = await mount()
	el.groups = [
		{ id: "g0", name: "Zero", limit: 1, color: "blue" },
		{ id: "g1", name: "One", limit: 1_000_00, color: "rose" },
	]
	el.rooms = new Map([["g1", room(500_00)]])
	el.choices = choices().map((c, i) => (i === 0 ? { ...c, card: { ...c.card, limitGroupId: "g1" } } : c))
	await el.updateComplete
	return el
}

test("each card is one tile button with data-card, in one tiles grid", async () => {
	const el = await tiles()
	const root = el.shadowRoot as ShadowRoot
	expect(root.querySelectorAll(".tiles")).toHaveLength(1)
	expect(root.querySelectorAll('.tiles > button.tile[type="button"][data-card]')).toHaveLength(choices().length)
	expect(root.querySelector(".panel")).toBeNull()
})

test("line 1 is id) name and the last 4 in the group's colour", async () => {
	const el = await tiles()
	const [a, b] = rows(el)
	expect(flat(a?.querySelector(".name"))).toBe("A) Alpha")
	expect(flat(a?.querySelector(".corner"))).toBe("•••• 1234")
	expect(a?.querySelector(".corner")?.hasAttribute("data-mono")).toBe(true)
	expect(a?.getAttribute("data-g")).toBe("rose")
	expect(b?.hasAttribute("data-g")).toBe(false)
})

test("line 2 says what is owed, or the credit, or nothing owed; the aside the urgency", async () => {
	const el = await tiles()
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
	expect(el.shadowRoot?.textContent).not.toContain("No limit group")
})

test("line 3 is the bill the payment goes to, else when the open statement closes and is due", async () => {
	const el = await tiles()
	el.today = "2026-11-04"
	// F's open statement keeps its own dates; the others fall back to the card's cycle.
	el.ledgers = new Map([
		[
			"F",
			{
				statements: [
					{
						...bill("2026-12-08"),
						period: "2026-11",
						cardId: "F",
						closeDate: "2026-11-18",
						open: true,
					},
				],
				owed: 300_00,
				credit: 0,
			},
		],
	]) as unknown as CcPayPicker["ledgers"]
	el.choices = [
		...choices(),
		{
			card: card("F", "Foxtrot"),
			owed: 300_00,
			credit: 0,
			bill: null,
			urgency: "none",
			days: 0,
		},
	]
	await el.updateComplete
	const facts = (i: number) => flat(rows(el)[i]?.querySelector(".facts"))
	expect(facts(0)).toBe("Bill closed 25 Sep 2026 · ฿120.00 left")
	expect(facts(3)).toBe("closes 25 Nov 2026 · due 15 Dec 2026")
	expect(facts(4)).toBe("closes 25 Nov 2026 · due 15 Dec 2026")
	expect(facts(5)).toBe("closes 18 Nov 2026 · due 08 Dec 2026")
	expect(el.shadowRoot?.textContent).not.toContain("so far")
})

test("the rail shows the group's used share; a card with no group has none", async () => {
	const el = await tiles()
	const [a, b] = rows(el)
	expect(a?.querySelector(".rail")?.getAttribute("aria-label")).toBe("50% of the limit used")
	expect(b?.querySelector(".rail")).toBeNull()
})

test("a tile is named by the card and what it owes, and a tap picks it", async () => {
	const el = await tiles()
	expect(rows(el)[0]?.getAttribute("aria-label")).toBe("Alpha, ฿500.00 owed")
	const picked: string[] = []
	el.addEventListener("pick", (e) => picked.push((e as CustomEvent<PickDetail>).detail.cardId))
	rows(el)[2]?.click()
	expect(picked).toEqual(["C"])
})

test("search narrows the rows, and an empty result says what to do", async () => {
	const el = await mount()
	const input = el.shadowRoot?.querySelector<HTMLInputElement>('input[type="search"]')
	if (!input) throw new Error("no search")
	input.value = "9999"
	input.dispatchEvent(new Event("input"))
	await el.updateComplete
	expect(rows(el).map((r) => r.dataset["card"])).toEqual(["B"])
	input.value = "zzz"
	input.dispatchEvent(new Event("input"))
	await el.updateComplete
	expect(rows(el)).toHaveLength(0)
	expect(flat(el.shadowRoot?.querySelector(".empty"))).toBe("No card matches. Clear the search.")
})

test("with no cards at all it says to add one, linking to Cards", async () => {
	setLocale("en")
	document.body.innerHTML = ""
	const el = document.createElement("cc-pay-picker")
	el.choices = []
	document.body.append(el)
	await el.updateComplete
	const empty = el.shadowRoot?.querySelector(".empty")
	expect(empty?.textContent?.replace(/\s+/g, " ").trim()).toBe("No cards yet. Add one on the Cards page.")
	expect(empty?.querySelector("a")?.getAttribute("href")).toBe("/cards")
})

test("with cards stored but none to pay, says archived paid-off cards are hidden", async () => {
	setLocale("en")
	document.body.innerHTML = ""
	const element = document.createElement("cc-pay-picker") as CcPayPicker
	element.choices = []
	element.total = 2
	document.body.append(element)
	await element.updateComplete
	expect(element.shadowRoot?.textContent?.trim()).toBe("No card to pay. Archived cards with nothing owed are hidden.")
	element.total = 0
	await element.updateComplete
	expect(element.shadowRoot?.textContent?.trim()).toBe("No cards yet. Add one on the Cards page.")
})

test("the picker draws tiles, not a row panel", () => {
	const text = (CcPayPicker.styles as { cssText: string }[]).map((s) => s.cssText).join("\n")
	expect(text).toContain(cardTileStyles.cssText)
	expect(text).not.toContain(rowPanel.cssText)
	expect(text).not.toContain("button[data-card]")
})
