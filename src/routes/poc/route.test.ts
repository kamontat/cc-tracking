import { expect, test } from "bun:test";
import { parseSheet, sheetPath } from "./route";

test("the list path opens no sheet", () => {
	expect(parseSheet("/poc/items")).toEqual({ kind: "none" });
	expect(parseSheet("/poc/items/")).toEqual({ kind: "none" });
});

test("new wins over an item called new", () => {
	expect(parseSheet("/poc/items/new")).toEqual({ kind: "new" });
});

test("an id and an id's edit open their sheets", () => {
	expect(parseSheet("/poc/items/a1")).toEqual({ kind: "view", id: "a1" });
	expect(parseSheet("/poc/items/a1/edit/")).toEqual({ kind: "edit", id: "a1" });
});

test("an unknown deeper path opens no sheet", () => {
	expect(parseSheet("/poc/items/a1/nope")).toEqual({ kind: "none" });
});

test("an id with a slash round-trips through its path", () => {
	const sheet = { kind: "view", id: "x/y#z" } as const;
	expect(sheetPath(sheet)).toBe("/poc/items/x%2Fy%23z");
	expect(parseSheet(sheetPath(sheet))).toEqual(sheet);
});
