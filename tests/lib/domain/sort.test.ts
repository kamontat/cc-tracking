import { expect, test } from "vitest"

import { directed, readDir, SORT_DIRS } from "#lib/domain/sort"

test("two directions, ascending first", () => {
	expect(SORT_DIRS).toEqual(["asc", "desc"])
})

test("readDir keeps a known direction and reads anything else as the field's default", () => {
	const defaults = { room: "desc", name: "asc" } as const
	expect(readDir("asc", "room", defaults)).toBe("asc")
	expect(readDir("desc", "name", defaults)).toBe("desc")
	expect(readDir(null, "room", defaults)).toBe("desc")
	expect(readDir("up", "name", defaults)).toBe("asc")
})

test("directed flips the key but never the tie-break", () => {
	type Row = { id: string; n: number }
	const rows: Row[] = [
		{ id: "b", n: 1 },
		{ id: "a", n: 1 },
		{ id: "c", n: 2 },
	]
	const byN = (a: Row, b: Row) => a.n - b.n
	const byId = (a: Row, b: Row) => a.id.localeCompare(b.id)
	expect([...rows].sort(directed(byN, "asc", byId)).map((r) => r.id)).toEqual(["a", "b", "c"])
	expect([...rows].sort(directed(byN, "desc", byId)).map((r) => r.id)).toEqual(["c", "a", "b"])
})
