import { existsSync } from "node:fs"
import { expect, test } from "vitest"

/**
 * No old address redirects (PRD RD-29): the retired pages simply 404, and `/backup`'s 301 to
 * `/settings` went with them, which left `public/_redirects` with nothing to hold.
 */
test("public/ has no _redirects", () => {
	expect(existsSync("public/_redirects")).toBe(false)
})
