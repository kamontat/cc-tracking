import { expect, test } from "vitest"

import { isCardId } from "#lib/domain/card"
import { isRecordId } from "#lib/ui/record-panel.svelte"

/** A card key in the address is a card id by the one rule the form and restore use (RD-28). */
test("the panel's card ids are isCardId's", async () => {
	for (const id of ["5", "12.3", "k1.2", "K1", "5.", ".5", "1..2", ""])
		expect(isRecordId("card", id)).toBe(isCardId(id))
	const source = await Bun.file("src/lib/ui/record-panel.svelte.ts").text()
	expect(source).toContain('from "#lib/domain/card"')
	expect(source).not.toMatch(/\[a-z\]\?\[0-9\]/)
})
