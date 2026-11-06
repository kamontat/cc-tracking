import { expect, test } from "vitest"

/** The four list pages: one static page per case, each a thin entry over the shared flows. */
const PAGES = ["new", "draft", "reply", "view"] as const

const page = (name: string) => Bun.file(`src/pages/list/${name}.astro`).text()

test("each list case has its own page, and the old single page is gone", async () => {
	for (const name of PAGES) {
		const source = await page(name)
		expect(source, name).toContain(`onPage("list/${name}", start)\n`)
		expect(source, name).toContain('mainClass="page--narrow"')
	}
	expect(await Bun.file("src/pages/list.astro").exists()).toBe(false)
})

/** The body of the first rule in `css` whose selector is exactly `selector`. */
const ruleBody = (css: string, selector: string) => {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	return css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1]
}

test("the empty status stays in the page for screen readers", async () => {
	const css = await Bun.file("src/styles/app.css").text()
	const empty = ruleBody(css, ".list-layout .status:empty")
	expect(empty).toBeDefined()
	expect(empty).not.toContain("display: none")
	expect(empty).toContain("clip-path")
})

test("the list page is narrow until a desktop gives it the page width", async () => {
	const tokens = await Bun.file("src/styles/tokens.css").text()
	expect(tokens).toMatch(/--cc-page-narrow:\s*[\d.]+rem;/)
	expect(tokens).toMatch(/--cc-page-width:\s*[\d.]+rem;/)
	const css = await Bun.file("src/styles/app.css").text()
	expect(ruleBody(css, ".page")).toContain("max-width: var(--cc-page-width)")
	expect(ruleBody(css, ".page--narrow")).toContain("max-width: var(--cc-page-narrow)")
	expect(css).toMatch(/@media \(min-width: 900px\)\s*\{\s*\.page--narrow\s*\{\s*max-width: var\(--cc-page-width\);/)
})

test("the side panel parks beside the lines from 900px", async () => {
	const css = await Bun.file("src/styles/app.css").text()
	expect(css).toMatch(
		/@media \(min-width: 900px\)\s*\{\s*\.list-layout\s*\{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) var\(--cc-side-panel\);/,
	)
	expect(ruleBody(css, ".list-layout__side")).toContain("display: contents")
})

test("the list bottom bars reserve no room for the Payment button", async () => {
	const { CcListAmounts } = await import("#legacy/components/cc-list-amounts")
	const { CcListReply } = await import("#legacy/components/cc-list-reply")
	for (const element of [CcListAmounts, CcListReply]) {
		const css = (element.styles as { cssText: string }[]).map((s) => s.cssText).join("\n")
		// The bar shares the Payment button's height token, but never sits above the button.
		expect(css).not.toMatch(/bottom:[^;]*--cc-bar-height/)
	}
})

test("the floating + New button and the selection bars share one height token", async () => {
	const tokens = await Bun.file("src/styles/tokens.css").text()
	expect(tokens).toMatch(/--cc-bar-height:/)
	const css = await Bun.file("src/styles/app.css").text()
	expect(ruleBody(css, ".fab")).toContain("block-size: var(--cc-bar-height)")
	expect(ruleBody(css, ".action-bar")).toContain("min-block-size: var(--cc-bar-height)")
	const { actionBarStyles } = await import("#legacy/styles/shared")
	expect(actionBarStyles.cssText).toContain("min-block-size: var(--cc-bar-height)")
})
