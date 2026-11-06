import { expect, test } from "vitest"

test("BaseLayout loads Google Tag Manager from PUBLIC_GTM_ID", async () => {
	const source = await Bun.file("src/layouts/BaseLayout.astro").text()
	expect(source).toContain('import { loadGtm } from "#lib/gtm"\n')
	expect(source).toContain("loadGtm(import.meta.env.PUBLIC_GTM_ID, document)\n")
})

test("BaseLayout puts every page's static copy in the reader's locale", async () => {
	const source = await Bun.file("src/layouts/BaseLayout.astro").text()
	expect(source).toContain('import { startCopy } from "#lib/i18n/copy"\n')
	expect(source).toContain("startCopy(document)\n")
})

test("Thai static copy stays hidden until the copy pass has run", async () => {
	const css = (await Bun.file("src/styles/app.css").text()).replace(/\/\*[\s\S]*?\*\//g, "")
	expect(css).toMatch(/html\[lang="th"\]:not\(\[data-i18n-ready\]\) \[data-i18n\]\s*\{\s*visibility:\s*hidden;?\s*\}/)
})

// Navigation between pages swaps the next page in without a reload (PRD DD-174).
test("BaseLayout turns on Astro's ClientRouter", async () => {
	const source = await Bun.file("src/layouts/BaseLayout.astro").text()
	expect(source).toContain('import { ClientRouter } from "astro:transitions"\n')
	expect(source).toMatch(/<ClientRouter\s*\/>/)
})

// A swap takes the next page's <html> attributes, so theme, tint and language would reset: the
// boot runs again after every swap, before the new page shows.
test("the boot runs again after every swap", async () => {
	const source = await Bun.file("src/layouts/BaseLayout.astro").text()
	expect(source).toMatch(/<script is:inline data-astro-rerun data-theme-boot>/)
})

test("BaseLayout carries the global styles, reset first", async () => {
	const source = await Bun.file("src/layouts/BaseLayout.astro").text()
	expect(source).toContain('import "@kcstyles/reset.css"\nimport "../styles/tokens.css"\nimport "../styles/app.css"\n')
})
