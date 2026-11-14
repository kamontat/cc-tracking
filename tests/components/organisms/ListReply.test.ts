import type { Card, LimitGroup, ListLine, PurchaseList } from "#lib/domain/types"

import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import ListReply from "#components/organisms/ListReply.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The spender's reply to a sent list: a row per card, as the builder's (DD-195), each opening its
 * card's sheet, where every order is answered.
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

const card = (id: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
})

const w1: PurchaseList = {
	id: "w1",
	date: "2026-10-30",
	status: "sent",
	sentAt: "2026-10-30T03:00:00.000Z",
	lines: [
		{ cardId: "A", amount: 12_500_00 },
		{ cardId: "B", amount: 4_800_00 },
		{ cardId: "C", amount: 22_000_00 },
	],
}

type Reply = { lines: ListLine[]; moveUnmade: boolean }

/** Mounts the reply, the open sheet held as the page holds it; `set` changes a prop afterwards. */
const show = async (list: PurchaseList = w1, extra: Record<string, unknown> = {}) => {
	if (mounted) unmount(mounted)
	setLocale("en")
	document.body.innerHTML = ""
	const values = new SvelteMap<string, unknown>(
		Object.entries({ list, cards: [card("A"), card("B")], groups: [], sheet: null, ...extra }),
	)
	const seen: Reply[] = []
	mounted = mount(ListReply, {
		target: document.body,
		props: {
			get list() {
				return values.get("list") as PurchaseList
			},
			get cards() {
				return values.get("cards") as Card[]
			},
			get groups() {
				return values.get("groups") as LimitGroup[]
			},
			get sheet() {
				return values.get("sheet") as string | null
			},
			onsheet: (next: string | null) => values.set("sheet", next),
			side: createRawSnippet(() => ({
				render: () => '<button type="button" data-action="cancel-list">Cancel list</button>',
			})),
			onsavereply: (detail: Reply) => seen.push(detail),
		},
	})
	await settle()
	return {
		seen,
		set: async (next: Record<string, unknown>) => {
			for (const [key, value] of Object.entries(next)) values.set(key, value)
			await settle()
		},
	}
}

const root = document.body
const flat = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""
const row = (id: string) => root.querySelector(`.lines > button.line[data-card="${id}"]`) as HTMLButtonElement | null
const rows = () => [...root.querySelectorAll(".lines > button.line")].map((el) => el.getAttribute("data-card"))
const sheetOf = (id: string) => root.querySelector<HTMLElement>(`dialog .card-step[data-card="${id}"]`)

/** Opens a card's sheet from its row, unless it is open already. */
const open = async (id: string) => {
	if (!sheetOf(id)) {
		const target = row(id)
		if (!target) throw new Error(`no row for ${id}`)
		target.click()
		await settle()
	}
	const sheet = sheetOf(id)
	if (!sheet) throw new Error(`no sheet for ${id}`)
	return sheet
}

/** A card's order (the first unless `order`) in its sheet, opening it. */
const orderOf = async (id: string, order = 0) => {
	const found = (await open(id)).querySelector<HTMLElement>(`.order[data-order="${order}"]`)
	if (!found) throw new Error(`no order ${order} for ${id}`)
	return found
}

const answerButton = async (id: string, answer: string, order = 0) =>
	(await orderOf(id, order)).querySelector(`[data-answer="${answer}"]`) as HTMLButtonElement
const actual = async (id: string, order = 0) =>
	(await orderOf(id, order)).querySelector('[data-field="actual"]') as HTMLInputElement | null
const noteOf = async (id: string, order = 0) =>
	(await orderOf(id, order)).querySelector('[data-field="note"]') as HTMLInputElement
const saveButton = () => root.querySelector('[data-action="save-reply"]') as HTMLButtonElement
const move = () => root.querySelector('[data-field="move"]') as HTMLInputElement | null
const summary = () => flat(root.querySelector(".action-bar .summary"))
const total = () => flat(root.querySelector(".action-bar .total"))

const done = async () => {
	root.querySelector<HTMLElement>('dialog [data-action="done"]')?.click()
	await settle()
}

const answer = async (id: string, which: "made" | "not-made", order = 0) => {
	;(await answerButton(id, which, order)).click()
	await settle()
}

const typeInto = async (input: HTMLInputElement | null, text: string) => {
	if (!input) throw new Error("no input")
	input.value = text
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

test("the list is a row per card in one row panel, and no sheet is open at first", async () => {
	await show()
	expect(flat(root.querySelector(".list-layout__main p.note"))).toBe(
		"Open each card to record whether it was made. Change the amount if the real one differs.",
	)
	expect(root.querySelector(".list-layout__main .row-panel.lines")).toBeInstanceOf(HTMLElement)
	expect(rows()).toEqual(["A", "B", "C"])
	expect(root.querySelector("dialog")).toBeNull()
	expect(flat(row("A")?.querySelector(".what small"))).toBe("Not answered")
	expect(flat(row("A")?.querySelector(".sum"))).toBe("฿12,500.00")
	expect(row("A")?.querySelector(".sum")?.hasAttribute("data-pending")).toBe(true)
})

test("a row opens its card's sheet, and Done closes it", async () => {
	await show()
	row("B")?.click()
	await settle()
	expect(sheetOf("B")).toBeInstanceOf(HTMLElement)
	// The sheet is headed by its card: the chip, then `id) name`.
	expect(flat(root.querySelector("dialog h2 .words"))).toBe("B) Card B")
	expect(root.querySelector("dialog h2 .mini")?.getAttribute("aria-hidden")).toBe("true")
	expect(flat(sheetOf("B")?.querySelector(".position"))).toBe("Card 2 of 3")
	await done()
	expect(root.querySelector("dialog")).toBeNull()
})

test("the sheet steps to the card before or after", async () => {
	await show()
	await open("B")
	root.querySelector<HTMLElement>('dialog [data-action="next-card"]')?.click()
	await settle()
	expect(sheetOf("C")).toBeInstanceOf(HTMLElement)
	expect(root.querySelector<HTMLButtonElement>('dialog [data-action="next-card"]')?.disabled).toBe(true)
	root.querySelector<HTMLElement>('dialog [data-action="prev-card"]')?.click()
	await settle()
	expect(sheetOf("B")).toBeInstanceOf(HTMLElement)
})

test("a card alone on the list has no place to step to", async () => {
	await show({ ...w1, lines: [{ cardId: "A", amount: 100 }] })
	expect((await open("A")).querySelector(".position")).toBeNull()
	expect(root.querySelector('dialog [data-action="next-card"]')).toBeNull()
})

test("save waits for every answer", async () => {
	await show()
	// One order has no heading of its own.
	expect((await open("A")).querySelector(".order-head")).toBeNull()
	const group = (await orderOf("A")).querySelector("fieldset.pair")
	expect(group?.getAttribute("aria-label")).toBe("Was it made?")
	await answer("A", "made")
	expect((await answerButton("A", "made")).getAttribute("aria-pressed")).toBe("true")
	expect((await answerButton("A", "not-made")).getAttribute("aria-pressed")).toBe("false")
	expect(saveButton().disabled).toBe(true)
	expect(flat(saveButton())).toBe("Save reply")
	expect(summary()).toBe("Answer every line (1 of 3)")
	expect(root.querySelector(".action-bar .summary")?.classList.contains("warned")).toBe(true)
})

test("Made and Not made are one toggle: quiet buttons with an icon each, the pressed one marked", async () => {
	await show()
	const made = await answerButton("A", "made")
	const notMade = await answerButton("A", "not-made")
	expect(made.closest("fieldset.pair.toggle")).toBeInstanceOf(HTMLElement)
	expect(made.getAttribute("data-variant")).toBe("quiet")
	expect(notMade.getAttribute("data-variant")).toBe("quiet")
	expect(made.querySelector("svg.icon")).toBeInstanceOf(SVGElement)
	expect(notMade.querySelector("svg.icon")).toBeInstanceOf(SVGElement)
	await answer("A", "not-made")
	expect((await answerButton("A", "made")).getAttribute("aria-pressed")).toBe("false")
	expect((await answerButton("A", "not-made")).getAttribute("aria-pressed")).toBe("true")
	expect((await answerButton("A", "not-made")).getAttribute("data-variant")).toBe("quiet")
})

test("the planned and real figures sit side by side, the real one the box to type in once made", async () => {
	await show()
	const figure = async (name: string) => flat((await orderOf("A")).querySelector(`.figures [data-figure="${name}"]`))
	expect(await figure("planned")).toBe("Planned ฿12,500.00")
	expect(await figure("real")).toBe("Real amount —")
	await answer("A", "not-made")
	expect(await figure("real")).toBe("Real amount Not made")
	await answer("A", "made")
	expect((await orderOf("A")).querySelector('.figures [data-figure="real"] [data-field="actual"]')).toBeInstanceOf(
		HTMLInputElement,
	)
})

test("a real amount off the plan offers the planned one back", async () => {
	await show()
	await answer("A", "made")
	expect((await orderOf("A")).querySelector('[data-action="use-planned"]')).toBeNull()
	await typeInto(await actual("A"), "13000")
	const use = (await orderOf("A")).querySelector<HTMLButtonElement>('[data-action="use-planned"]')
	expect(flat(use)).toBe("Use planned ฿12,500.00")
	expect(use?.getAttribute("data-variant")).toBe("quiet")
	use?.click()
	await settle()
	expect((await actual("A"))?.value).toBe("12500")
	expect(flat(await orderOf("A"))).not.toContain("vs plan")
})

test("a made line takes the real amount", async () => {
	await show()
	expect(await actual("A")).toBeNull()
	await answer("A", "made")
	expect((await actual("A"))?.value).toBe("12500")
	expect(flat(await orderOf("A"))).not.toContain("vs plan")
	await typeInto(await actual("A"), "13000")
	expect(flat(await orderOf("A"))).toContain("+฿500.00 vs plan")
	expect((await orderOf("A")).querySelector("p.diff")).toBeInstanceOf(HTMLElement)
	await typeInto(await actual("A"), "12000")
	expect(flat(await orderOf("A"))).toContain("−฿500.00 vs plan")
})

test("a real amount typed without a bubbling event still counts", async () => {
	await show()
	await answer("A", "made")
	const input = (await actual("A")) as HTMLInputElement
	input.value = "13000"
	input.dispatchEvent(new Event("input"))
	await settle()
	expect(flat(await orderOf("A"))).toContain("+฿500.00 vs plan")
})

test("a row says what was answered and sums what was made", async () => {
	await show()
	await answer("A", "made")
	await typeInto(await actual("A"), "13000")
	await answer("B", "not-made")
	await done()
	expect(flat(row("A")?.querySelector(".what small"))).toBe("Made · +฿500.00 vs plan")
	expect(flat(row("A")?.querySelector(".sum"))).toBe("฿13,000.00")
	expect(row("A")?.querySelector(".sum")?.hasAttribute("data-pending")).toBe(false)
	expect(flat(row("B")?.querySelector(".what small"))).toBe("Not made")
	expect(row("B")?.querySelector(".sum")?.hasAttribute("data-unmade")).toBe(true)
	expect(total()).toBe("฿13,000.00")
})

test("a row with a real amount that is not money has the warning bar", async () => {
	await show()
	await answer("A", "made")
	await typeInto(await actual("A"), "abc")
	await done()
	expect(row("A")?.hasAttribute("data-warn")).toBe(true)
	expect(flat(row("A")?.querySelector(".what small"))).toBe("Made · not an amount")
})

test("not made offers the move, ticked", async () => {
	await show()
	expect(move()).toBeNull()
	await answer("B", "not-made")
	expect(await actual("B")).toBeNull()
	expect(move()?.checked).toBe(true)
	expect(flat(move()?.closest("label"))).toBe("Move Card B to a draft for Sat, 31 Oct")
})

test("saving sends the answers", async () => {
	const { seen } = await show()
	await answer("A", "made")
	await typeInto(await actual("A"), "13000")
	await answer("B", "not-made")
	await answer("C", "made")
	await done()
	const box = move() as HTMLInputElement
	box.checked = false
	box.dispatchEvent(new Event("change", { bubbles: true }))
	await settle()
	expect(saveButton().disabled).toBe(false)
	expect(flat(saveButton())).toBe("Save 2 purchases")
	expect(summary()).toBe("2 made · 1 not made")
	expect(total()).toBe("฿35,000.00")
	saveButton().click()
	expect(seen).toEqual([
		{
			lines: [
				{ cardId: "A", amount: 1250000, made: true, actual: 1300000 },
				{ cardId: "B", amount: 480000, made: false },
				{ cardId: "C", amount: 2200000, made: true },
			],
			moveUnmade: false,
		},
	])
})

test("one made line says purchase, none says reply", async () => {
	await show()
	await answer("A", "made")
	await answer("B", "not-made")
	await answer("C", "not-made")
	expect(flat(saveButton())).toBe("Save 1 purchase")
	expect(flat(move()?.closest("label"))).toBe("Move Card B, c-[C] to a draft for Sat, 31 Oct")
	await answer("A", "not-made")
	expect(flat(saveButton())).toBe("Save reply")
	expect(saveButton().disabled).toBe(false)
})

test("a real amount that is not money stops the save", async () => {
	await show()
	await answer("A", "made")
	await answer("B", "made")
	await answer("C", "made")
	expect(saveButton().disabled).toBe(false)
	await typeInto(await actual("A"), "abc")
	expect(flat(await orderOf("A"))).toContain("Enter the amount in baht, like 1234.56.")
	expect((await orderOf("A")).querySelector("p.error")).toBeInstanceOf(HTMLElement)
	expect(saveButton().disabled).toBe(true)
	await typeInto(await actual("A"), "")
	expect(saveButton().disabled).toBe(true)
})

test("answers survive a language switch", async () => {
	await show()
	await answer("A", "made")
	await typeInto(await actual("A"), "13000")
	await answer("B", "not-made")
	setLocale("th")
	await settle()
	expect((await answerButton("B", "not-made")).getAttribute("aria-pressed")).toBe("true")
	expect((await answerButton("A", "made")).getAttribute("aria-pressed")).toBe("true")
	expect((await actual("A"))?.value).toBe("13000")
	expect(flat(await answerButton("A", "made"))).toBe("ซื้อแล้ว")
	expect((await answerButton("C", "made")).getAttribute("aria-pressed")).toBe("false")
})

test("a fresh copy of the same list keeps the answers; a different list starts afresh", async () => {
	const { set } = await show()
	await answer("A", "made")
	await typeInto(await actual("A"), "13000")
	await typeInto(await noteOf("B"), "later")
	await set({ list: { ...w1, lines: w1.lines.map((l) => ({ ...l })) }, cards: [card("A"), card("B")] })
	expect((await noteOf("B")).value).toBe("later")
	expect((await answerButton("A", "made")).getAttribute("aria-pressed")).toBe("true")
	expect((await actual("A"))?.value).toBe("13000")
	await set({ sheet: null, list: { ...w1, id: "w2", lines: [{ cardId: "A", amount: 100, note: "fuel" }] } })
	expect(rows()).toEqual(["A"])
	expect((await answerButton("A", "made")).getAttribute("aria-pressed")).toBe("false")
	expect((await noteOf("A")).value).toBe("fuel")
	expect(summary()).toBe("Answer every line (0 of 1)")
})

test("a row and its sheet are headed by the card in the panel form", async () => {
	await show(w1, { groups: [{ id: "g1", name: "KBank", limit: 100_000_00, color: "teal" }] })
	expect(flat(row("A")?.querySelector(".card-label"))).toBe("A) Card A")
	expect(flat(row("A")?.querySelector(".mini"))).toBe("1111")
	expect(row("A")?.querySelector(".mini")?.hasAttribute("data-g")).toBe(false)
	// C is no longer stored: its id stays, with a dash for the name.
	expect(flat(row("C")?.querySelector(".card-label"))).toBe("C) —")
	expect(row("C")?.querySelector(".mini")?.getAttribute("aria-hidden")).toBe("true")
	expect(row("A")?.querySelector(".mini")?.hasAttribute("aria-hidden")).toBe(false)
	await open("A")
	expect(flat(root.querySelector("dialog h2 .words"))).toBe("A) Card A")
})

test("the card chip wears its group's colour", async () => {
	await show(w1, {
		cards: [{ ...card("A"), limitGroupId: "g1" }, card("B")],
		groups: [{ id: "g1", name: "KBank", limit: 100_000_00, color: "teal" }],
	})
	expect(row("A")?.querySelector(".mini")?.getAttribute("data-g")).toBe("teal")
})

test("the move checkbox and Save sit in the side panel, the rows in the main column", async () => {
	await show()
	await answer("B", "not-made")
	await done()
	const main = root.querySelector(".list-layout > .list-layout__main")
	const side = root.querySelector(".list-layout > .list-layout__side")
	expect(main?.querySelectorAll("button.line")).toHaveLength(3)
	expect(side?.querySelector('[data-field="move"]')).toBeInstanceOf(HTMLElement)
	expect(side?.querySelector('.action-bar [data-action="save-reply"]')).toBeInstanceOf(HTMLElement)
})

test("the side panel takes the page's own actions after Save", async () => {
	await show()
	const cancel = root.querySelector('.list-layout__side > [data-action="cancel-list"]')
	expect(cancel).toBeInstanceOf(HTMLElement)
	expect(cancel?.previousElementSibling?.classList.contains("action-bar")).toBe(true)
})

test("each order shows its note to edit, made or not, the row shows it, and saving sends it trimmed", async () => {
	const { seen } = await show({
		...w1,
		lines: [
			{ cardId: "A", amount: 100, note: "fuel" },
			{ cardId: "B", amount: 200, note: "stamps" },
			{ cardId: "C", amount: 300 },
		],
	})
	expect(flat(row("A")?.querySelector(".what small"))).toBe("Not answered · fuel")
	// Shown before any answer, so the note can be read and changed first.
	expect((await noteOf("A")).value).toBe("fuel")
	expect(flat((await noteOf("A")).closest("label"))).toBe("Note (optional)")
	expect((await noteOf("A")).getAttribute("placeholder")).toBeTruthy()
	expect((await noteOf("C")).value).toBe("")
	await answer("A", "made")
	await typeInto(await noteOf("A"), "  diesel ")
	await answer("B", "not-made")
	await typeInto(await noteOf("B"), "   ")
	await answer("C", "made")
	await typeInto(await noteOf("C"), "cash back")
	// A language switch keeps the typed notes.
	setLocale("th")
	await settle()
	expect((await noteOf("C")).value).toBe("cash back")
	expect((await noteOf("A")).value).toBe("  diesel ")
	saveButton().click()
	expect(seen[0]?.lines).toEqual([
		{ cardId: "A", amount: 100, made: true, note: "diesel" },
		{ cardId: "B", amount: 200, made: false },
		{ cardId: "C", amount: 300, made: true, note: "cash back" },
	])
})

test("each note box is named for its card", async () => {
	await show()
	expect((await noteOf("A")).getAttribute("aria-label")).toBe("Note for Card A")
	// A card no longer stored keeps its id.
	expect((await noteOf("C")).getAttribute("aria-label")).toBe("Note for c-[C]")
})

test("a card's orders share its row and its sheet, each answered on its own", async () => {
	const { seen } = await show({
		...w1,
		lines: [
			{ cardId: "B", amount: 1_000_00 },
			{ cardId: "A", amount: 500_00 },
			{ cardId: "B", amount: 2_000_00 },
		],
	})
	expect(rows()).toEqual(["B", "A"])
	expect(flat(row("B")?.querySelector(".sum"))).toBe("฿3,000.00")
	expect(flat(row("B")?.querySelector(".what small"))).toBe("2 orders · Not answered")
	const sheet = await open("B")
	expect([...sheet.querySelectorAll(".order-head")].map(flat)).toEqual(["Order 1", "Order 2"])
	expect([...sheet.querySelectorAll('[data-figure="planned"]')].map(flat)).toEqual([
		"Planned ฿1,000.00",
		"Planned ฿2,000.00",
	])
	await answer("B", "not-made", 0)
	await done()
	expect(flat(row("B")?.querySelector(".what small"))).toBe("2 orders · 1 of 2 answered")
	await answer("B", "made", 1)
	await done()
	expect(flat(row("B")?.querySelector(".what small"))).toBe("2 orders · 1 made · 1 not made")
	expect(flat(row("B")?.querySelector(".sum"))).toBe("฿2,000.00")
	await answer("B", "not-made", 1)
	await answer("A", "made")
	expect(flat(move()?.closest("label"))).toBe("Move Card B to a draft for Sat, 31 Oct")
	saveButton().click()
	expect(seen.at(-1)?.lines).toEqual([
		{ cardId: "B", amount: 1_000_00, made: false },
		{ cardId: "A", amount: 500_00, made: true },
		{ cardId: "B", amount: 2_000_00, made: false },
	])
})
