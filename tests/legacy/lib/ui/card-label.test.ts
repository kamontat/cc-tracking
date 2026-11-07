import type { Card, LimitGroup } from "#lib/domain/types"

import { render } from "lit"
import { afterEach, expect, test } from "vitest"

import { cardLineHtml, cardMini, cardPanel } from "#legacy/lib/ui/card-label"
import { setLocale } from "#lib/i18n/index"

afterEach(() => setLocale("en"))

const card: Card = {
	id: "10",
	name: "Card A10",
	last4: "4412",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g2",
}

const groups: LimitGroup[] = [
	{ id: "g1", name: "SCB", limit: 1, color: "blue" },
	{ id: "g2", name: "UOB", limit: 1, color: "rose" },
	{ id: "g5", name: "T", limit: 1, color: "nope" as never },
]

const { limitGroupId: _, ...ungrouped } = card

const text = (host: Element | null | undefined) => host?.textContent?.replace(/\s+/g, " ").trim()

test("the line markup holds the full and the short form, for CSS to swap", () => {
	const host = document.createElement("div")
	render(cardLineHtml("10", card), host)
	expect(text(host.querySelector(".cl-full"))).toBe("10) Card A10 (4412)")
	expect(text(host.querySelector(".cl-short"))).toBe("10) Card A10")
	expect(host.querySelector(".cl-short")?.getAttribute("aria-hidden")).toBe("true")
})

test("the panel form is the last-4 chip, then id) name", () => {
	const host = document.createElement("div")
	render(cardPanel("10", card, groups), host)
	expect(host.querySelector(".mini")?.textContent).toBe("4412")
	expect(host.querySelector(".mini")?.getAttribute("data-g")).toBe("rose")
	expect(text(host.querySelector(".card-label"))).toBe("10) Card A10")
	expect(text(host)).toBe("4412 10) Card A10")

	render(cardPanel("A", undefined, groups), host)
	expect(host.querySelector(".mini")?.textContent).toBe("")
	expect(text(host.querySelector(".card-label"))).toBe("A) —")
})

test("the mini chip shows the last 4 in the group's colour", () => {
	const host = document.createElement("div")
	render(cardMini(card, groups, true), host)
	const mini = host.querySelector(".mini")
	expect(mini?.textContent).toBe("4412")
	expect(mini?.getAttribute("data-g")).toBe("rose")
	expect(mini?.hasAttribute("data-big")).toBe(true)
	render(cardMini(ungrouped, groups), host)
	expect(host.querySelector(".mini")?.hasAttribute("data-g")).toBe(false)
	render(cardMini(undefined, groups), host)
	expect(host.querySelector(".mini")?.getAttribute("aria-hidden")).toBe("true")
})
