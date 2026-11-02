import { expect, test } from "bun:test";
import type { PurchaseList } from "#lib/domain/types";
import { listPageAddress, newListAddress } from "./list-address";

const list = (id: string, status: PurchaseList["status"]): PurchaseList => ({
	id,
	date: "2026-10-31",
	status,
	lines: [],
});

test("a new list carries one card per parameter, in order", () => {
	const address = newListAddress(["B", "A,1", "x&y"]);
	expect(address.startsWith("/list/new?")).toBe(true);
	const query = new URLSearchParams(address.slice(address.indexOf("?")));
	expect(query.getAll("card")).toEqual(["B", "A,1", "x&y"]);
});

test("a stored list opens the page for its status", () => {
	expect(listPageAddress(list("d 1", "draft"))).toBe("/list/draft?id=d%201");
	expect(listPageAddress(list("w&1", "sent"))).toBe("/list/reply?id=w%261");
	expect(listPageAddress(list("s/1", "saved"))).toBe("/list/view?id=s%2F1");
});
