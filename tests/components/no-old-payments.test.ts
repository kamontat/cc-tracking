import { expect, test } from "vitest"

/**
 * Payments are card payments now. The per-statement records are read only (to convert them),
 * so no page or component may write one back through the repository. (The `savePayment` helper in
 * `record-payment.ts` writes card payments and is a plain function, not a repository method.)
 */
test("no route or component writes an old statement payment", async () => {
	const offenders: string[] = []
	let scanned = 0
	// Every UI folder: the atomic tiers, the layouts and the pages.
	for await (const path of new Bun.Glob("{components,layouts,pages}/**/*.{ts,astro,svelte}").scan({
		cwd: "src",
	})) {
		scanned++
		const text = await Bun.file(`src/${path}`).text()
		if (/\.(savePayment|deletePayment)\(/.test(text)) offenders.push(path)
	}
	expect(scanned).toBeGreaterThan(0)
	expect(offenders).toEqual([])
})
