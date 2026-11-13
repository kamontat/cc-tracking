import { expect, test } from "vitest"

import * as limit from "#lib/domain/limit"
import { usageLevel, usageShare } from "#lib/domain/limit"

test("no card goes unassigned: every card has a limit group (RD-27)", () => {
	expect("unassignedCards" in limit).toBe(false)
})

test("usage level reads within, high from 80% used, and over past the limit", () => {
	expect(usageLevel(0, 100_000)).toBe("within")
	expect(usageLevel(79_999, 100_000)).toBe("within")
	expect(usageLevel(80_000, 100_000)).toBe("high")
	expect(usageLevel(100_000, 100_000)).toBe("high")
	expect(usageLevel(100_001, 100_000)).toBe("over")
	// A zero limit has no room at all, so anything spent is over it.
	expect(usageLevel(0, 0)).toBe("within")
	expect(usageLevel(1, 0)).toBe("over")
})

test("usage share is the used fraction as a 0-100 percentage, clamped", () => {
	expect(usageShare(25_000, 100_000)).toBe(25)
	expect(usageShare(150_000, 100_000)).toBe(100)
	expect(usageShare(-5, 100_000)).toBe(0)
	expect(usageShare(5, 0)).toBe(100)
	expect(usageShare(0, 0)).toBe(0)
})
