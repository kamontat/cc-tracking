import { afterEach, expect, test } from "vitest"
import "#legacy/components/cc-owed-list"
import type { PayChoice } from "#lib/domain/pay"
import type { Card } from "#lib/domain/types"

import { cardTileStyles } from "#legacy/components/card-tile"
import { CcOwedList } from "#legacy/components/cc-owed-list"
import { rowPanel } from "#legacy/styles/shared"
import { setLocale } from "#lib/i18n/index"

afterEach(() => setLocale("en"))

const card = (id: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
})

const rows = (): PayChoice[] => [
	{
		card: card("A"),
		owed: 500_00,
		credit: 0,
		bill: null,
		urgency: "overdue",
		days: 3,
	} as PayChoice,
	{
		card: card("B/2"),
		owed: 0,
		credit: 120_00,
		bill: null,
		urgency: "none",
		days: 0,
	} as PayChoice,
]

const mount = async (props: Partial<CcOwedList> = {}) => {
	document.body.innerHTML = ""
	const element = document.createElement("cc-owed-list") as CcOwedList
	element.rows = rows()
	element.sort = "urgency"
	Object.assign(element, props)
	document.body.append(element)
	await element.updateComplete
	return { element, root: element.shadowRoot as ShadowRoot }
}

test("each row leads to the payment sheet on its card", async () => {
	const { root } = await mount()
	const links = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[data-card]"))
	expect(links.map((link) => link.getAttribute("href"))).toEqual(["/pay?card=A", "/pay?card=B%2F2"])
	expect(links[0]?.textContent).toContain("฿500.00")
	expect(links[0]?.textContent).toContain("Overdue 3 days")
	expect(links[1]?.textContent).toContain("Credit ฿120.00")
	expect(links[0]?.querySelector("[data-numeric]")).not.toBeNull()
})

test("the sort chip emits the chosen sort", async () => {
	const { element, root } = await mount()
	let sort = ""
	element.addEventListener("sort", (e) => {
		sort = (e as CustomEvent).detail.sort
	})
	const select = root.querySelector("select[name=sort]") as HTMLSelectElement
	select.value = "left"
	select.dispatchEvent(new Event("change"))
	expect(sort).toBe("left")
})

test("empty says nothing is owed", async () => {
	const { root } = await mount({ rows: [] })
	expect(root.querySelector(".empty")?.textContent?.trim()).toBe("Nothing owed on any card.")
})

test("heads the list and draws each card as a wallet tile in one column", async () => {
	const { root } = await mount({
		groups: [{ id: "g1", name: "One", limit: 1_000_00, color: "blue" }],
		rooms: new Map([
			[
				"g1",
				{
					group: { id: "g1", name: "One", limit: 1_000_00, color: "blue" },
					used: 250_00,
					available: 750_00,
					held: 0,
					room: 750_00,
					level: "within",
					sharedWith: 0,
				},
			],
		]),
		today: "2026-11-04",
		rows: rows().map((r, i) =>
			i === 0
				? {
						...r,
						card: { ...r.card, limitGroupId: "g1" },
						bill: {
							period: "2026-09",
							cardId: "A",
							closeDate: "2026-09-18",
							dueDate: "2026-10-03",
							total: 500_00,
							paidAmount: 0,
							remaining: 500_00,
							parts: [],
							open: false,
						},
					}
				: r,
		) as PayChoice[],
	})
	expect(root.querySelector("h2")?.textContent).toBe("Owed on each card")
	expect(root.querySelector(".panel")).toBeNull()
	expect(root.querySelectorAll(".tiles")).toHaveLength(1)
	const [a, b] = Array.from(root.querySelectorAll<HTMLAnchorElement>(".tiles > a.tile[data-card]"))
	const flat = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, " ").trim() ?? ""
	expect(flat(a?.querySelector(".name"))).toBe("A) Card A")
	expect(flat(a?.querySelector(".corner"))).toBe("•••• 1111")
	expect(a?.getAttribute("data-g")).toBe("blue")
	expect(flat(a?.querySelector(".room"))).toBe("฿500.00 owed")
	expect(flat(a?.querySelector(".aside"))).toBe("Overdue 3 days")
	expect(a?.querySelector(".aside")?.getAttribute("data-tone")).toBe("bad")
	expect(flat(a?.querySelector(".facts"))).toBe("Bill closed 18 Sep 2026 · ฿500.00 left")
	expect(a?.querySelector(".rail")?.getAttribute("aria-label")).toBe("25% of the limit used")
	expect(a?.getAttribute("aria-label")).toBe("Card A, ฿500.00 owed")
	expect(flat(b?.querySelector(".room"))).toBe("Credit ฿120.00")
	expect(flat(b?.querySelector(".facts"))).toBe("closes 18 Nov 2026 · due 03 Dec 2026")
	expect(b?.hasAttribute("data-g")).toBe(false)
	expect(b?.querySelector(".rail")).toBeNull()
})

test("the owed list draws tiles in a single column, not a row panel", () => {
	const text = (CcOwedList.styles as { cssText: string }[]).map((s) => s.cssText).join("\n")
	expect(text).toContain(cardTileStyles.cssText)
	expect(text).not.toContain(rowPanel.cssText)
	expect(text).toMatch(/\.tiles\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
})
