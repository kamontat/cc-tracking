import { expect, test } from "vitest"

/**
 * The purchase list pages' layout (`/transactions/lists/new`, `/transactions/lists/edit`): the
 * builder's and the reply's steps, their side panel and their bars. Moved from the old `/list/*`
 * pages' test when those pages retired (RD-26).
 */
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

// On a phone the two steps keep the tighter gap they had in their shadow roots (`listLayout`'s
// `--cc-space-4`); app.css's wider phone gap is the review's and the saved list's.
test("the amounts and reply steps keep their tighter phone gap", async () => {
	for (const island of ["ListAmounts", "ListReply"]) {
		const source = await Bun.file(`src/components/organisms/${island}.svelte`).text()
		expect(source, island).toMatch(
			/@media \(max-width: 899px\)\s*\{\s*\.list-layout\s*\{\s*gap: var\(--cc-space-4\);\s*\}/,
		)
	}
})

// A Thai warning has long runs with no space; the one track it sits in must still shrink to its
// box, or the box grows past a phone's edge: a reply's line card, and the add-a-card sheet's card
// (DD-195), where the amounts step's warnings now are.
test("the track a warning sits in shrinks to its box", async () => {
	for (const [island, selector] of [
		["ListAmounts", "card-step"],
		["ListReply", "line"],
	]) {
		const source = await Bun.file(`src/components/organisms/${island}.svelte`).text()
		expect(source, island).toMatch(
			new RegExp(`\\t\\.${selector}\\s*\\{[^}]*grid-template-columns: minmax\\(0, 1fr\\);`),
		)
	}
})

test("the list bottom bars reserve no room for the Payment button", async () => {
	for (const island of ["ListAmounts", "ListReply"]) {
		const source = await Bun.file(`src/components/organisms/${island}.svelte`).text()
		// The bar shares the Payment button's height token, but never sits above the button.
		expect(source, island).not.toMatch(/bottom:[^;]*--cc-bar-height/)
	}
})

test("the selection bars keep one height token", async () => {
	const tokens = await Bun.file("src/styles/tokens.css").text()
	expect(tokens).toMatch(/--cc-bar-height:/)
	const css = await Bun.file("src/styles/app.css").text()
	expect(ruleBody(css, ".action-bar")).toContain("min-block-size: var(--cc-bar-height)")
})
