import type { Card, LimitGroup, ListLine, PurchaseList } from "#lib/domain/types"

import { createRawSnippet, flushSync, mount, unmount } from "svelte"
import { SvelteMap } from "svelte/reactivity"
import { afterEach, expect, test } from "vitest"

import ListReply from "#components/organisms/ListReply.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The spender's reply to a sent list. Ported from the legacy `cc-list-reply` tests, against the
 * same markup.
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

/** Mounts the reply; `set` changes a prop afterwards, as the page would. */
const show = async (list: PurchaseList = w1, extra: Record<string, unknown> = {}) => {
	if (mounted) unmount(mounted)
	setLocale("en")
	document.body.innerHTML = ""
	const values = new SvelteMap<string, unknown>(
		Object.entries({ list, cards: [card("A"), card("B")], groups: [], ...extra }),
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
const line = (id: string) => root.querySelector(`section.line[data-card="${id}"]`) as HTMLElement
const answerButton = (id: string, answer: string) =>
	line(id).querySelector(`[data-answer="${answer}"]`) as HTMLButtonElement
const actual = (id: string) => line(id).querySelector('[data-field="actual"]') as HTMLInputElement
const noteOf = (id: string) => line(id).querySelector('[data-field="note"]') as HTMLInputElement
const saveButton = () => root.querySelector('[data-action="save-reply"]') as HTMLButtonElement
const move = () => root.querySelector('[data-field="move"]') as HTMLInputElement | null

const answer = async (id: string, which: "made" | "not-made") => {
	answerButton(id, which).click()
	await settle()
}

const typeInto = async (input: HTMLInputElement, text: string) => {
	input.value = text
	input.dispatchEvent(new Event("input", { bubbles: true }))
	await settle()
}

test("save waits for every answer", async () => {
	await show()
	expect(flat(root.querySelector("p.note"))).toBe(
		"Record the spender's reply for each line. Change the amount if the real one differs.",
	)
	expect(flat(line("A"))).toContain("planned ฿12,500.00")
	const group = line("A").querySelector("fieldset.pair")
	expect(group?.getAttribute("aria-label")).toBe("Was it made?")
	await answer("A", "made")
	expect(answerButton("A", "made").getAttribute("aria-pressed")).toBe("true")
	expect(answerButton("A", "not-made").getAttribute("aria-pressed")).toBe("false")
	expect(saveButton().disabled).toBe(true)
	expect(flat(saveButton())).toBe("Answer every line (1 of 3)")
})

test("the answer buttons take the variants: quiet until pressed, danger for not made", async () => {
	await show()
	expect(answerButton("A", "made").getAttribute("data-variant")).toBe("quiet")
	expect(answerButton("A", "not-made").getAttribute("data-variant")).toBe("quiet")
	await answer("A", "made")
	expect(answerButton("A", "made").hasAttribute("data-variant")).toBe(false)
	await answer("A", "not-made")
	expect(answerButton("A", "made").getAttribute("data-variant")).toBe("quiet")
	expect(answerButton("A", "not-made").getAttribute("data-variant")).toBe("danger")
})

test("a made line takes the real amount", async () => {
	await show()
	expect(actual("A")).toBeNull()
	await answer("A", "made")
	expect(actual("A").value).toBe("12500")
	expect(flat(line("A"))).not.toContain("vs plan")
	await typeInto(actual("A"), "13000")
	expect(flat(line("A"))).toContain("+฿500.00 vs plan")
	expect(line("A").querySelector("p.diff")).toBeInstanceOf(HTMLElement)
	await typeInto(actual("A"), "12000")
	expect(flat(line("A"))).toContain("−฿500.00 vs plan")
})

test("a real amount typed without a bubbling event still counts", async () => {
	await show()
	await answer("A", "made")
	const input = actual("A")
	input.value = "13000"
	input.dispatchEvent(new Event("input"))
	await settle()
	expect(flat(line("A"))).toContain("+฿500.00 vs plan")
})

test("not made offers the move, ticked", async () => {
	await show()
	expect(move()).toBeNull()
	await answer("B", "not-made")
	expect(actual("B")).toBeNull()
	expect(move()?.checked).toBe(true)
	expect(flat(move()?.closest("label"))).toBe("Move Card B to a draft for Sat, 31 Oct")
})

test("saving sends the answers", async () => {
	const { seen } = await show()
	await answer("A", "made")
	await typeInto(actual("A"), "13000")
	await answer("B", "not-made")
	await answer("C", "made")
	const box = move() as HTMLInputElement
	box.checked = false
	box.dispatchEvent(new Event("change", { bubbles: true }))
	await settle()
	expect(saveButton().disabled).toBe(false)
	expect(flat(saveButton())).toBe("Save 2 purchases · ฿35,000.00")
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

test("one made line says purchase", async () => {
	await show()
	await answer("A", "made")
	await answer("B", "not-made")
	await answer("C", "not-made")
	expect(flat(saveButton())).toBe("Save 1 purchase · ฿12,500.00")
	expect(flat(move()?.closest("label"))).toBe("Move Card B, c-[C] to a draft for Sat, 31 Oct")
})

test("a real amount that is not money stops the save", async () => {
	await show()
	await answer("A", "made")
	await answer("B", "made")
	await answer("C", "made")
	expect(saveButton().disabled).toBe(false)
	await typeInto(actual("A"), "abc")
	expect(flat(line("A"))).toContain("Enter the amount in baht, like 1234.56.")
	expect(line("A").querySelector("p.error")).toBeInstanceOf(HTMLElement)
	expect(saveButton().disabled).toBe(true)
	await typeInto(actual("A"), "")
	expect(saveButton().disabled).toBe(true)
})

test("answers survive a language switch", async () => {
	await show()
	await answer("A", "made")
	await answer("B", "not-made")
	await typeInto(actual("A"), "13000")
	setLocale("th")
	await settle()
	expect(answerButton("A", "made").getAttribute("aria-pressed")).toBe("true")
	expect(answerButton("B", "not-made").getAttribute("aria-pressed")).toBe("true")
	expect(answerButton("C", "made").getAttribute("aria-pressed")).toBe("false")
	expect(actual("A").value).toBe("13000")
	expect(flat(answerButton("A", "made"))).toBe("ซื้อแล้ว")
})

test("a fresh copy of the same list keeps the answers; a different list starts afresh", async () => {
	const { set } = await show()
	await answer("A", "made")
	await typeInto(actual("A"), "13000")
	await typeInto(noteOf("B"), "later")
	await set({ list: { ...w1, lines: w1.lines.map((l) => ({ ...l })) }, cards: [card("A"), card("B")] })
	expect(answerButton("A", "made").getAttribute("aria-pressed")).toBe("true")
	expect(actual("A").value).toBe("13000")
	expect(noteOf("B").value).toBe("later")
	await set({ list: { ...w1, id: "w2", lines: [{ cardId: "A", amount: 100, note: "fuel" }] } })
	expect(answerButton("A", "made").getAttribute("aria-pressed")).toBe("false")
	expect(noteOf("A").value).toBe("fuel")
	expect(line("B")).toBeNull()
	expect(flat(saveButton())).toBe("Answer every line (0 of 1)")
})

test("a line is headed by the card in the panel form", async () => {
	await show(w1, { groups: [{ id: "g1", name: "KBank", limit: 100_000_00, color: "teal" }] })
	expect(flat(line("A").querySelector(".card-label"))).toBe("A) Card A")
	expect(flat(line("A").querySelector(".mini"))).toBe("1111")
	expect(line("A").querySelector(".mini")?.hasAttribute("data-g")).toBe(false)
	// C is no longer stored: its id stays, with a dash for the name.
	expect(flat(line("C").querySelector(".card-label"))).toBe("C) —")
	expect(line("C").querySelector(".mini")?.getAttribute("aria-hidden")).toBe("true")
	expect(line("A").querySelector(".mini")?.hasAttribute("aria-hidden")).toBe(false)
})

test("the card chip wears its group's colour", async () => {
	await show(w1, {
		cards: [{ ...card("A"), limitGroupId: "g1" }, card("B")],
		groups: [{ id: "g1", name: "KBank", limit: 100_000_00, color: "teal" }],
	})
	expect(line("A").querySelector(".card-panel .mini")?.getAttribute("data-g")).toBe("teal")
})

test("the move checkbox and Save sit in the side panel, the lines in the main column", async () => {
	await show()
	await answer("B", "not-made")
	const main = root.querySelector(".list-layout > .list-layout__main")
	const side = root.querySelector(".list-layout > .list-layout__side")
	expect(main?.querySelectorAll("section.line")).toHaveLength(3)
	expect(side?.querySelector('[data-field="move"]')).toBeInstanceOf(HTMLElement)
	expect(side?.querySelector('[data-action="save-reply"]')).toBeInstanceOf(HTMLElement)
})

test("the side panel takes the page's own actions after Save", async () => {
	await show()
	const cancel = root.querySelector('.list-layout__side > [data-action="cancel-list"]')
	expect(cancel).toBeInstanceOf(HTMLElement)
	expect(cancel?.previousElementSibling?.classList.contains("action-bar")).toBe(true)
})

test("each line shows its note to edit, made or not, and saving sends it trimmed", async () => {
	const { seen } = await show({
		...w1,
		lines: [
			{ cardId: "A", amount: 100, note: "fuel" },
			{ cardId: "B", amount: 200, note: "stamps" },
			{ cardId: "C", amount: 300 },
		],
	})
	// Shown before any answer, so the note can be read and changed first.
	expect(noteOf("A").value).toBe("fuel")
	expect(flat(noteOf("A").closest("label"))).toBe("Note (optional)")
	expect(noteOf("A").getAttribute("placeholder")).toBeTruthy()
	expect(noteOf("C").value).toBe("")
	await answer("A", "made")
	await answer("B", "not-made")
	await answer("C", "made")
	await typeInto(noteOf("A"), "  diesel ")
	await typeInto(noteOf("B"), "   ")
	await typeInto(noteOf("C"), "cash back")
	// A language switch keeps the typed notes.
	setLocale("th")
	await settle()
	expect(noteOf("A").value).toBe("  diesel ")
	expect(noteOf("C").value).toBe("cash back")
	saveButton().click()
	expect(seen[0]?.lines).toEqual([
		{ cardId: "A", amount: 100, made: true, note: "diesel" },
		{ cardId: "B", amount: 200, made: false },
		{ cardId: "C", amount: 300, made: true, note: "cash back" },
	])
})

test("each note box is named for its card", async () => {
	await show()
	expect(noteOf("A").getAttribute("aria-label")).toBe("Note for Card A")
	// A card no longer stored keeps its id.
	expect(noteOf("C").getAttribute("aria-label")).toBe("Note for c-[C]")
})

test("each order on a card is answered on its own, and the move names the card once", async () => {
	const { seen } = await show({
		...w1,
		lines: [
			{ cardId: "B", amount: 1_000_00 },
			{ cardId: "B", amount: 2_000_00 },
			{ cardId: "A", amount: 500_00 },
		],
	})
	const notMade = [...root.querySelectorAll<HTMLButtonElement>('section.line[data-card="B"] [data-answer="not-made"]')]
	expect(notMade).toHaveLength(2)
	for (const button of notMade) button.click()
	await answer("A", "made")
	expect(flat(move()?.closest("label"))).toBe("Move Card B to a draft for Sat, 31 Oct")
	saveButton().click()
	expect(seen.at(-1)?.lines).toEqual([
		{ cardId: "B", amount: 1_000_00, made: false },
		{ cardId: "B", amount: 2_000_00, made: false },
		{ cardId: "A", amount: 500_00, made: true },
	])
})
