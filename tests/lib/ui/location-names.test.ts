import type { LocationRecord } from "#lib/domain/types"

import { afterEach, describe, expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { nameProblem, problemText } from "#lib/ui/location-names"

/** The seeded three: two under their English defaults, Krabi too. */
const records: LocationRecord[] = [
	{ id: "bangkok", name: "Bangkok", takesPurchases: false },
	{ id: "krabi", name: "Krabi", takesPurchases: true },
	{ id: "phichit", name: "Phichit", takesPurchases: false },
]

afterEach(() => setLocale("en"))

describe("nameProblem", () => {
	test("refuses an empty or blank name", () => {
		expect(nameProblem("", records)).toEqual({ kind: "empty" })
		expect(nameProblem("   ", records)).toEqual({ kind: "empty" })
	})

	test("refuses another location's name, trimmed and in any case", () => {
		expect(nameProblem(" bangKOK ", records)).toEqual({ kind: "duplicate", name: "bangKOK" })
	})

	test("lets a location keep its own name in another case", () => {
		expect(nameProblem("KRABI", records, "krabi")).toBeNull()
	})

	test("counts a default's name in either language as taken, whatever language is on", () => {
		setLocale("en")
		expect(nameProblem("กระบี่", records)?.kind).toBe("duplicate")
		setLocale("th")
		expect(nameProblem("Krabi", records)?.kind).toBe("duplicate")
	})

	test("a renamed default no longer holds its catalog names", () => {
		const renamed = records.map((record) => (record.id === "bangkok" ? { ...record, name: "BKK" } : record))
		expect(nameProblem("กรุงเทพฯ", renamed)).toBeNull()
		expect(nameProblem("bkk", renamed)?.kind).toBe("duplicate")
	})

	test("accepts a new name", () => {
		expect(nameProblem("Chiang Mai", records)).toBeNull()
	})
})

describe("problemText", () => {
	test("says why, in the reader's language", () => {
		expect(problemText({ kind: "empty" })).toBe("Give the location a name.")
		expect(problemText({ kind: "duplicate", name: "Krabi" })).toBe("There is already a location called Krabi.")
	})
})
