import type { PurchaseList } from "#lib/domain/types"

import { expect, test } from "vitest"

import {
	EDIT_LIST_ADDRESS,
	listEditAddress,
	listKey,
	listPageAddress,
	listPanelAddress,
	NEW_LIST_ADDRESS,
	newListAddress,
} from "#lib/ui/list-address"

const list = (id: string, status: PurchaseList["status"]): PurchaseList => ({
	id,
	date: "2026-10-31",
	status,
	lines: [],
})

test("the builder and the edit page live under the Lists tab's path", () => {
	expect(NEW_LIST_ADDRESS).toBe("/transactions/lists/new")
	expect(EDIT_LIST_ADDRESS).toBe("/transactions/lists/edit")
})

test("a new list carries its cards in `cards`, one each, in order", () => {
	expect(newListAddress([])).toBe("/transactions/lists/new")
	expect(newListAddress(["12.3", "7", "k1.2"])).toBe("/transactions/lists/new?cards=12.3&cards=7&cards=k1.2")
})

test("a draft or a waiting list is worked on at the edit page, under `list`", () => {
	expect(listEditAddress("d1")).toBe("/transactions/lists/edit?list=d1")
	expect(listPageAddress(list("d1", "draft"))).toBe("/transactions/lists/edit?list=d1")
	expect(listPageAddress(list("w1", "sent"))).toBe("/transactions/lists/edit?list=w1")
})

test("a saved list has only its panel, on the Lists tab", () => {
	expect(listPanelAddress("s1")).toBe("/transactions/lists?list=s1")
	expect(listPageAddress(list("s1", "saved"))).toBe("/transactions/lists?list=s1")
})

test("listKey reads the edit page's `list`, or null when there is none", () => {
	expect(listKey("?list=w1")).toBe("w1")
	expect(listKey("?id=w1")).toBeNull()
	expect(listKey("?list=")).toBeNull()
})
