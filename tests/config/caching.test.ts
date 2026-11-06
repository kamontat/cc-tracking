import { expect, test } from "vitest"

import config from "../../astro.config"

/**
 * A tap between pages used to wait on the network twice: the next page's HTML was fetched only
 * on the tap, and then each of its ~20 script chunks was re-checked with the server one after
 * another (`max-age=0, must-revalidate`, a 304 each), about 2 seconds on a phone in Thailand.
 */

test("the hashed build files are cached for a year: a new build gives them new names", async () => {
	const headers = await Bun.file("public/_headers").text()
	expect(headers).toContain("/_astro/*\n  Cache-Control: public, max-age=31536000, immutable")
})

test("a page's HTML is not cached for long, so a deploy shows on the next page", async () => {
	const headers = await Bun.file("public/_headers").text()
	// Only the hashed files get a long cache; the pages keep Cloudflare's revalidate-every-time.
	const rules = headers.split(/\n(?=\S)/).filter((rule) => rule.includes("Cache-Control"))
	expect(rules.map((rule) => rule.split("\n")[0])).toEqual(["/_astro/*"])
})

test("links are fetched as they come into view, so a tap swaps a page already in hand", () => {
	expect(config.prefetch).toEqual({ prefetchAll: true, defaultStrategy: "viewport" })
})
