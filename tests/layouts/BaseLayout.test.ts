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

test("BaseLayout carries the global styles, reset first", async () => {
	const source = await Bun.file("src/layouts/BaseLayout.astro").text()
	expect(source).toContain('import "@kcstyles/reset.css"\nimport "../styles/tokens.css"\nimport "../styles/app.css"\n')
})
