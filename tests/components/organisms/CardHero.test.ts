import type { GroupRoom } from "#lib/domain/room"
import type { Card, LedgerStatement, LimitGroup } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import CardHero from "#components/organisms/CardHero.svelte"
import { setLocale } from "#lib/i18n/index"

/**
 * The top of a card's page: the hero on the group's pastel (the group, its holder and the cards
 * it is shared with, the room, the bar and the share used), then three stats. Ported from the
 * legacy `cc-card-hero` tests, against the same markup.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const scb: LimitGroup = {
	id: "g1",
	name: "SCB Business",
	limit: 200_000_00,
	color: "rose",
}
const other: LimitGroup = { id: "g0", name: "KBank", limit: 100_000_00 }

const card: Card = {
	id: "SCB-B",
	name: "SCB Bangkok",
	last4: "5521",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 25 },
	archived: false,
	limitGroupId: "g1",
}
const sibling: Card = { ...card, id: "SCB-K", name: "SCB Krabi" }

const room = (overrides: Partial<GroupRoom> = {}): GroupRoom => ({
	group: scb,
	used: 120_000_00,
	available: 80_000_00,
	held: 18_450_00,
	room: 61_550_00,
	level: "within",
	sharedWith: 1,
	...overrides,
})

const bill = (overrides: Partial<LedgerStatement> = {}): LedgerStatement => ({
	cardId: "SCB-B",
	period: "2026-10",
	closeDate: "2026-10-10",
	dueDate: "2026-11-04",
	purchases: [],
	total: 14_700_00,
	paidAmount: 0,
	payments: [],
	remaining: 14_700_00,
	paid: false,
	open: false,
	...overrides,
})

const show = (props: Record<string, unknown> = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(CardHero, {
		target: document.body,
		props: {
			card,
			cards: [card, sibling],
			groups: [other, scb],
			room: room(),
			owed: 14_700_00,
			credit: 0,
			next: bill(),
			today: "2026-10-30",
			locations: [{ id: "bangkok", name: "Bangkok", takesPurchases: false }],
			...props,
		} as never,
	})
	flushSync()
	return document.body
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? ""

test("the hero names the group, its holder and the cards it is shared with, on the group's pastel", () => {
	const root = show()
	const hero = root.querySelector(".hero")
	expect(hero?.getAttribute("data-g")).toBe("rose")
	expect(text(hero?.querySelector(".who"))).toBe("SCB Business · KC · shared with SCB-K")
})

test("a group of one names no one to share with", () => {
	const root = show({ cards: [card], room: room({ sharedWith: 0 }) })
	expect(text(root.querySelector(".who"))).toBe("SCB Business · KC")
})

test("the room is the big figure, of the limit, with the bar and the share used", () => {
	const root = show()
	expect(text(root.querySelector(".big"))).toBe("฿61,550.00")
	expect(text(root.querySelector(".of"))).toBe("room of ฿200,000.00")
	// used + held = 138,450 of 200,000 = 69%.
	const fill = root.querySelector<HTMLElement>(".bar > span")
	expect(fill?.getAttribute("style")).toContain("69%")
	expect(root.querySelector(".bar")?.getAttribute("aria-hidden")).toBe("true")
	expect(text(root.querySelector(".used"))).toBe("69% used · buy today: closes 10 Nov 2026, due 05 Dec 2026")
})

test("a card on no group is invalid data: no hero, and nothing said about it (RD-27)", () => {
	const root = show({ room: null })
	expect(root.querySelector(".hero")).toBeNull()
	expect(text(root)).not.toContain("no limit group")
	expect(root.querySelector(".stats")).not.toBeNull()
})

test("no card renders nothing", () => {
	const root = show({ card: null })
	expect(root.querySelector(".hero")).toBeNull()
	expect(root.querySelector(".stats")).toBeNull()
})

test("three stats: owed, the next bill, and where the card is kept", () => {
	const root = show()
	const stats = [...root.querySelectorAll(".stat")].map((s) => [
		text(s.querySelector("small")),
		text(s.querySelector("b")),
	])
	expect(stats).toEqual([
		["Owed", "฿14,700.00"],
		["Next bill", "฿14,700.00"],
		["Kept in", "Bangkok"],
	])
	expect(root.querySelector("b[data-overdue]")).toBeNull()
})

test("Kept in names the place by its record, in the reader's language", () => {
	const kept = (root: Element) => text(root.querySelectorAll(".stat")[2]?.querySelector("b"))
	let root = show({
		card: { ...card, location: "chiang-mai" },
		locations: [{ id: "chiang-mai", name: "Chiang Mai", takesPurchases: false }],
	})
	expect(kept(root)).toBe("Chiang Mai")
	root = show({
		locations: [{ id: "bangkok", name: "Head office", takesPurchases: false }],
	})
	expect(kept(root)).toBe("Head office")
	root = show()
	setLocale("th")
	flushSync()
	expect(kept(root)).toBe("กรุงเทพฯ")
})

test("an overdue next bill reads in the bad colour; no bill is a dash", () => {
	let root = show({ today: "2026-11-20" })
	expect(text(root.querySelector("b[data-overdue]"))).toBe("฿14,700.00")
	root = show({ next: null, owed: 0 })
	expect(text(root.querySelectorAll(".stat b")[1])).toBe("—")
})

test("credit takes the third stat's place when the card holds some", () => {
	const root = show({ credit: 5_000_00, owed: 0, next: null })
	const last = root.querySelectorAll(".stat")[2]
	expect(text(last?.querySelector("small"))).toBe("Credit")
	expect(text(last?.querySelector("b"))).toBe("฿5,000.00")
})

test("figures carry data-numeric", () => {
	const root = show()
	expect(root.querySelector(".big")?.hasAttribute("data-numeric")).toBe(true)
	expect([...root.querySelectorAll(".stat b")].slice(0, 2).every((b) => b.hasAttribute("data-numeric"))).toBe(true)
})

test("a language switch re-renders in place", () => {
	const root = show()
	setLocale("th")
	flushSync()
	expect(text(root.querySelector(".stat small"))).toBe("ยอดค้าง")
	expect(text(root.querySelector(".of"))).toContain("฿200,000.00")
	expect(text(root.querySelector(".of"))).not.toBe("room of ฿200,000.00")
})

test("its look is its own scoped style, through tokens only", async () => {
	const style = (await Bun.file("src/components/organisms/CardHero.svelte").text()).split("<style>")[1] ?? ""
	expect(style).toMatch(/\.hero\s*\{/)
	expect(style).toMatch(/\.stats\s*\{/)
	expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i)
	// A media query's breakpoint is the one length a var() cannot carry.
	expect(style.replace(/@media[^{]*/g, "")).not.toMatch(/\d(px|rem)\b/)
})
