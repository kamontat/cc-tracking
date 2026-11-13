import type { Card } from "#lib/domain/types"
import type { BackupV4 } from "#lib/storage/transfer-v4"

import { afterEach, expect, test } from "vitest"

import { resetLocale, setLocale } from "#lib/i18n/index"
import { memoryStorage } from "#lib/storage/contract"
import { formatBytes, storedBytes, summariseData, summaryRows } from "#lib/ui/data-summary"

afterEach(() => resetLocale())

const card = (id: string, archived = false): Card => ({
	id,
	name: id,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived,
	limitGroupId: "pool",
})

const empty: BackupV4 = {
	version: 4,
	exportedAt: "2026-11-14T00:00:00.000Z",
	limitGroups: [],
	cards: [],
	purchases: [],
	payments: [],
	statementDates: [],
	lists: [],
	locations: [],
	owners: [],
}

const full: BackupV4 = {
	...empty,
	limitGroups: [{ id: "pool", name: "Pool", limit: 100 }],
	cards: [card("k1"), card("k2"), card("k3", true)],
	purchases: [
		{ id: "p1", cardId: "k1", date: "2026-03-05", amount: 1_000, note: "" },
		{ id: "p2", cardId: "k2", date: "2025-01-02", amount: 2_550, note: "" },
		{ id: "p3", cardId: "k1", date: "2026-11-12", amount: 450, note: "" },
	],
	payments: [
		{ id: "a", cardId: "k1", date: "2026-03-20", amount: 1_000, status: "paid" },
		{ id: "b", cardId: "k2", date: "2026-04-20", amount: 500, status: "paid" },
		{ id: "c", cardId: "k2", date: "2026-12-20", amount: 700, status: "planned" },
	],
	lists: [
		{ id: "l1", date: "2026-03-01", status: "draft", lines: [] },
		{ id: "l2", date: "2026-03-02", status: "sent", lines: [] },
		{ id: "l3", date: "2026-03-03", status: "saved", lines: [] },
		{ id: "l4", date: "2026-03-04", status: "saved", lines: [] },
	],
	locations: [
		{ id: "krabi", name: "Krabi", takesPurchases: true },
		{ id: "bangkok", name: "Bangkok", takesPurchases: false },
	],
	owners: [
		{ id: "KC", name: "KC" },
		{ id: "NT", name: "NT" },
		{ id: "RI", name: "RI" },
	],
}

test("sums up every kind of record a backup carries", () => {
	expect(summariseData(full, 2048)).toEqual({
		cards: { active: 2, archived: 1 },
		limitGroups: 1,
		purchases: { count: 3, total: 4_000, first: "2025-01-02", last: "2026-11-12" },
		payments: { paid: 2, paidTotal: 1_500, planned: 1 },
		lists: { draft: 1, sent: 1, saved: 2 },
		locations: 2,
		owners: 3,
		bytes: 2048,
	})
})

test("an empty store has no purchase dates", () => {
	expect(summariseData(empty, 0).purchases).toEqual({ count: 0, total: 0, first: null, last: null })
})

test("counts the bytes of the app's own keys only, two per character as the browser keeps them", () => {
	const storage = memoryStorage()
	storage.setItem("cc:card:k1", "abcd")
	storage.setItem("cc:lang", "th")
	storage.setItem("other", "ignored")
	expect(storedBytes(storage)).toBe(("cc:card:k1abcd".length + "cc:langth".length) * 2)
})

test("formats a size in bytes, kilobytes or megabytes", () => {
	expect(formatBytes(0)).toBe("0 B")
	expect(formatBytes(1023)).toBe("1023 B")
	expect(formatBytes(1536)).toBe("1.5 KB")
	expect(formatBytes(5 * 1024 * 1024 + 300_000)).toBe("5.3 MB")
})

const rowsOf = (backup: BackupV4, bytes: number) =>
	summaryRows(summariseData(backup, bytes)).map(({ row, label, value, sub }) => [row, label, value, sub])

test("draws a row per kind, with its count and the detail under it", () => {
	expect(rowsOf(full, 1536)).toEqual([
		["cards", "Cards", "3", "2 active · 1 archived"],
		["limit-groups", "Limit groups", "1", ""],
		["purchases", "Purchases", "3", "฿40.00 · 02 Jan 2025 to 12 Nov 2026"],
		["payments", "Payments", "3", "2 paid, ฿15.00 · 1 planned"],
		["lists", "Purchase lists", "4", "1 draft · 1 waiting · 2 saved"],
		["locations", "Locations", "2", ""],
		["owners", "Owners", "3", ""],
		["storage", "Storage used", "1.5 KB", "In this browser only"],
	])
})

test("says when there is nothing yet, rather than a range of no dates", () => {
	const rows = rowsOf(empty, 0)
	expect(rows.find(([row]) => row === "purchases")).toEqual(["purchases", "Purchases", "0", "None yet"])
	expect(rows.find(([row]) => row === "cards")).toEqual(["cards", "Cards", "0", "None yet"])
})

test("reads in Thai", () => {
	setLocale("th")
	const rows = rowsOf(full, 1536)
	expect(rows[0]?.[1]).toBe("บัตร")
	expect(rows[2]?.[3]).toContain("ม.ค. 2025")
})
