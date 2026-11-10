import { expect, test } from "vitest"

import { toggled } from "#lib/ui/toggle"

test("adds a value at the end, or takes it out, leaving the list untouched", () => {
	const values = ["a", "b"]
	expect(toggled(values, "c")).toEqual(["a", "b", "c"])
	expect(toggled(values, "a")).toEqual(["b"])
	expect(values).toEqual(["a", "b"])
})
