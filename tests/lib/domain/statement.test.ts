import type { Card } from "#lib/domain/types"

import { describe, expect, test } from "vitest"

import { recentPeriods } from "#lib/domain/statement"

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
}

describe("recentPeriods", () => {
	test("returns periods newest first, starting from the open one", () => {
		// 2026-09-21 is past the 18th, so the open period is October.
		expect(recentPeriods(card, "2026-09-21", 3)).toEqual(["2026-10", "2026-09", "2026-08"])
	})

	test("returns the open period alone when asked for one", () => {
		expect(recentPeriods(card, "2026-09-10", 1)).toEqual(["2026-09"])
	})
})
