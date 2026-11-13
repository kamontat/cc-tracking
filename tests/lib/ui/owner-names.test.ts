import { afterEach, expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { ownerNameProblem, ownerProblemText } from "#lib/ui/owner-names"

afterEach(() => setLocale("en"))

const owners = [
	{ id: "KC", name: "KC" },
	{ id: "pim", name: "Pim" },
]

test("a name is refused when empty, or when another owner goes by it, trimmed and in any case", () => {
	expect(ownerNameProblem("  ", owners)).toEqual({ kind: "empty" })
	expect(ownerNameProblem(" pim ", owners)).toEqual({ kind: "duplicate", name: "pim" })
	expect(ownerNameProblem("Ann", owners)).toBeNull()
	// An owner's own name, in any case, is not taken from itself.
	expect(ownerNameProblem("PIM", owners, "pim")).toBeNull()
})

test("says why in the reader's language", () => {
	expect(ownerProblemText({ kind: "empty" })).toBe("Give the owner a name.")
	expect(ownerProblemText({ kind: "duplicate", name: "Pim" })).toBe("There is already an owner called Pim.")
	setLocale("th")
	expect(ownerProblemText({ kind: "empty" })).toBe("ตั้งชื่อเจ้าของ")
})
