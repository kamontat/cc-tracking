import type { PurchaseList } from "#lib/domain/types"

import { expect, test } from "vitest"

import { listId, listPageAddress, listSheetAddress, newListAddress, readListSheet } from "#lib/ui/list-address"

test("listId reads the stored list's id from the address, or null when there is none", () => {
	expect(listId("?id=w1")).toBe("w1")
	expect(listId("?id=a%2Fb")).toBe("a/b")
	expect(listId("")).toBeNull()
})

const list = (id: string, status: PurchaseList["status"]): PurchaseList => ({
	id,
	date: "2026-10-31",
	status,
	lines: [],
})

test("a new list carries one card per parameter, in order", () => {
	const address = newListAddress(["B", "A,1", "x&y"])
	expect(address.startsWith("/list/new?")).toBe(true)
	const query = new URLSearchParams(address.slice(address.indexOf("?")))
	expect(query.getAll("card")).toEqual(["B", "A,1", "x&y"])
})

test("a stored list opens the page for its status", () => {
	expect(listPageAddress(list("d 1", "draft"))).toBe("/list/draft?id=d%201")
	expect(listPageAddress(list("w&1", "sent"))).toBe("/list/reply?id=w%261")
	expect(listPageAddress(list("s/1", "saved"))).toBe("/list/view?id=s%2F1")
})

test("readListSheet reads the add-a-card sheet from the address: the picker, one card, or none", () => {
	expect(readListSheet("")).toBeNull()
	expect(readListSheet("?card=A")).toBeNull()
	expect(readListSheet("?card=A&add=1")).toEqual({ kind: "pick" })
	expect(readListSheet("?id=d1&open=B")).toEqual({ kind: "card", cardId: "B" })
	// A card's sheet wins when both are there; an empty `open` is no card.
	expect(readListSheet("?add=1&open=a%2Fb")).toEqual({ kind: "card", cardId: "a/b" })
	expect(readListSheet("?open=")).toBeNull()
})

test("listSheetAddress writes the sheet into the page's address, keeping every other key", () => {
	expect(listSheetAddress("/list/new", "?card=A&card=B", { kind: "pick" })).toBe("/list/new?card=A&card=B&add=1")
	expect(listSheetAddress("/list/new", "?card=A&add=1", { kind: "card", cardId: "a/b" })).toBe(
		"/list/new?card=A&open=a%2Fb",
	)
	expect(listSheetAddress("/list/draft", "?id=d1&open=B", null)).toBe("/list/draft?id=d1")
	expect(listSheetAddress("/list/new", "?add=1", null)).toBe("/list/new")
})

test("a new list's cards keep the sheet's key as it is", () => {
	expect(newListAddress(["A", "B"], "?card=A&add=1")).toBe("/list/new?add=1&card=A&card=B")
})
