import type { PurchaseList } from "#lib/domain/types"

import { expect, test } from "vitest"

import { listId, listPageAddress, newListAddress } from "#lib/ui/list-address"

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
