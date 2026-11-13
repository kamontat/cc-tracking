import { expect, test } from "vitest"

/**
 * The detail panel (RD-23, DD-196) fits the screen: its head stays put and only its body scrolls,
 * so reading the panel never scrolls the page. Layout is CSS, which happy-dom doesn't lay out, so
 * these hold the rules; the sizes themselves are checked in a browser.
 */
const tokens = await Bun.file("src/styles/tokens.css").text()
const app = await Bun.file("src/styles/app.css").text()
const panel = (await Bun.file("src/components/molecules/DetailPanel.svelte").text()).split("<style>")[1] ?? ""

/** The text inside every `@media (<query>) { ... }` block, in order. */
const media = (css: string, query: string): string[] => {
	const out: string[] = []
	let from = 0
	for (;;) {
		const at = css.indexOf(`@media (${query}) {`, from)
		if (at < 0) return out
		const open = css.indexOf("{", at)
		let depth = 1
		let i = open + 1
		for (; depth > 0; i++) {
			if (css[i] === "{") depth++
			if (css[i] === "}") depth--
		}
		out.push(css.slice(open + 1, i - 1))
		from = i
	}
}

/** The declarations of the first rule whose selector list holds `selector` exactly. */
const rule = (css: string, selector: string): Map<string, string> => {
	for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selectors = (match[1] ?? "")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.split(",")
			.map((s) => s.trim())
		if (!selectors.includes(selector)) continue
		const out = new Map<string, string>()
		for (const line of (match[2] ?? "").replace(/\/\*[\s\S]*?\*\//g, "").split(";")) {
			const at = line.indexOf(":")
			if (at > 0)
				out.set(
					line.slice(0, at).trim(),
					line
						.slice(at + 1)
						.trim()
						.replace(/\s+/g, " "),
				)
		}
		return out
	}
	throw new Error(`no rule for ${selector}`)
}

const wide = (css: string) => media(css, "min-width: 900px").join("\n")
const narrow = (css: string) => media(css, "max-width: 899px").join("\n")

test("the column's place and height are tokens, the page's foot among them", () => {
	expect(tokens).toMatch(/--cc-page-foot:\s*calc\(/)
	expect(tokens).toMatch(/--cc-detail-column-top:\s*calc\(var\(--cc-header-height\) \+ var\(--cc-space-5\)\);/)
	expect(tokens).toMatch(
		/--cc-detail-column-height:\s*calc\(100dvh - var\(--cc-detail-column-top\) - var\(--cc-page-foot\)\);/,
	)
})

test("from 900px the page's foot is the token the column clears", () => {
	expect(rule(wide(app), ".page").get("padding-bottom")).toBe("var(--cc-page-foot)")
})

test("the panel itself never scrolls: its body does, and holds the scroll in", () => {
	expect(rule(panel, ".detail-panel").get("overflow")).toBe("hidden")
	const body = rule(panel, ".detail-panel__body")
	expect(body.get("flex")).toBe("1")
	expect(body.get("min-block-size")).toBe("0")
	expect(body.get("overflow-y")).toBe("auto")
	expect(body.get("overscroll-behavior")).toBe("contain")
})

test("from 900px the panel is a column of the screen's remaining height, parked under the header", () => {
	const column = rule(wide(panel), ".detail-panel")
	expect(column.get("position")).toBe("sticky")
	expect(column.get("top")).toBe("var(--cc-detail-column-top)")
	expect(column.get("block-size")).toBe("var(--cc-detail-column-height)")
	expect(column.has("max-block-size")).toBe(false)
})

test("a form's sticky save sinks through the body's bottom padding to the panel's foot", () => {
	expect(tokens).toMatch(/--cc-detail-body-end:\s*calc\(var\(--cc-space-5\) \+ env\(safe-area-inset-bottom, 0px\)\);/)
	expect(rule(panel, ".detail-panel__body").get("padding")).toBe(
		"var(--cc-space-4) var(--cc-space-4) var(--cc-detail-body-end)",
	)
	for (const foot of [
		".detail-panel__body .card-form .actions",
		".detail-panel__body .purchase-form .actions",
		".detail-panel__body .pay-actions",
	]) {
		const footer = rule(app, foot)
		expect(footer.get("position")).toBe("sticky")
		expect(footer.get("bottom")).toBe("calc(-1 * var(--cc-detail-body-end))")
	}
})

test("below 900px the page behind the sheet doesn't scroll", () => {
	expect(rule(narrow(app), "html:has(.detail-panel)").get("overflow")).toBe("hidden")
})
