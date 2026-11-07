import type { Card, PurchaseList } from "#lib/domain/types"

import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"

import ListTable from "#components/organisms/ListTable.svelte"
import { setLocale } from "#lib/i18n/index"
import { shareTable } from "#lib/ui/list-share"

/**
 * The review step's table of a list: what Copy text and Save image also say. Ported from the
 * legacy `cc-list-table` tests.
 */
let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
	setLocale("en")
})

const card = (id: string, name: string, last4: string): Card => ({
	id,
	name,
	last4,
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
})

const cards = [card("KB-F", "KBank Fuel", "4412"), card("UOB-K", "UOB Krabi", "7765")]

const list: Pick<PurchaseList, "date" | "lines"> = {
	date: "2026-10-31",
	lines: [
		{ cardId: "KB-F", amount: 12_500_00 },
		{ cardId: "UOB-K", amount: 4_800_00 },
	],
}

const show = (props: { list?: Parameters<typeof shareTable>[0]; cards?: Card[] } = {}) => {
	if (mounted) unmount(mounted)
	document.body.innerHTML = ""
	mounted = mount(ListTable, {
		target: document.body,
		props: { list: props.list ?? list, cards: props.cards ?? cards },
	})
	flushSync()
	return document.body
}

const texts = (root: ParentNode, selector: string) =>
	[...root.querySelectorAll(selector)].map((cell) => cell.textContent?.trim())

test("the table matches the share table", () => {
	const root = show()
	const table = shareTable(list, cards)
	expect(root.querySelector(".doc h3")?.textContent).toBe(table.title)
	expect(root.querySelector(".doc p")?.textContent).toBe(table.date)
	expect(texts(root, "thead th")).toEqual(table.headers)
	expect(texts(root, "tbody td")).toEqual(table.rows.flat())
	expect(texts(root, "tfoot td")).toEqual(table.total)
	expect(root.querySelectorAll("tbody tr")).toHaveLength(2)
	const numeric = (selector: string) => root.querySelector(selector)?.hasAttribute("data-numeric")
	expect(numeric("thead th:last-child")).toBe(true)
	expect(numeric("tfoot td:last-child")).toBe(true)
	expect(root.querySelectorAll("tbody td[data-numeric]")).toHaveLength(2)
	expect(root.querySelector("tfoot td")?.getAttribute("colspan")).toBe("2")
})

test("each body cell is labelled by its column, for the stacked phone layout", () => {
	const root = show()
	const [cardHead, nameHead, amountHead] = shareTable(list, cards).headers
	const first = [...root.querySelectorAll("tbody tr:first-child td")].map((td) => td.getAttribute("data-label"))
	expect(first).toEqual([cardHead, nameHead, amountHead])
})

test("a saved list shows what was really bought", () => {
	const saved = {
		date: "2026-10-31",
		status: "saved" as const,
		lines: [
			{ cardId: "KB-F", amount: 12_500_00, made: true, actual: 12_000_00 },
			{ cardId: "UOB-K", amount: 4_800_00, made: false },
		],
	}
	const root = show({ list: saved })
	expect(texts(root, "tbody td")).toEqual(shareTable(saved, cards).rows.flat())
	expect(texts(root, "tfoot td")).toEqual(shareTable(saved, cards).total)
})

test("the table sits in a row panel", () => {
	const root = show({ list: { date: "2026-10-31", lines: [] } })
	expect(root.querySelector(".row-panel table")).toBeInstanceOf(HTMLElement)
	expect(root.querySelectorAll("tbody tr")).toHaveLength(0)
})

test("follows a switch of language", () => {
	const root = show()
	setLocale("th")
	flushSync()
	const table = shareTable(list, cards)
	expect(root.querySelector(".doc h3")?.textContent).toBe(table.title)
	expect(texts(root, "thead th")).toEqual(table.headers)
	expect(texts(root, "tfoot td")).toEqual(table.total)
})

test("a hairline sits between the body rows, and between the header and the first body row", async () => {
	const source = await Bun.file("src/components/organisms/ListTable.svelte").text()
	const style = source.slice(source.indexOf("<style>"))
	expect(style).toMatch(/tbody tr \+ tr[^{]*\{[^}]*border-top: var\(--cc-border-width\) solid var\(--cc-border\)/)
	expect(style).toMatch(/tbody tr:first-child[^{]*\{[^}]*border-top/)
})
