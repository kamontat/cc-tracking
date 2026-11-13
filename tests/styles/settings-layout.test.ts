import { expect, test } from "vitest"

/**
 * Settings' two columns (CD-11) need the room for two: from 900px, and only while the page beside
 * an open panel (DD-203) still has it; otherwise its sections stack in one column. Layout is CSS,
 * which happy-dom doesn't lay out, so these hold the rules; the widths are checked in a browser.
 */
const app = await Bun.file("src/styles/app.css").text()

/** The text inside every `<at-rule> { ... }` block whose prelude is `prelude`, in order. */
const blocks = (css: string, prelude: string): string[] => {
	const out: string[] = []
	let from = 0
	for (;;) {
		const at = css.indexOf(`${prelude} {`, from)
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

const twoColumns = /\.settings-grid\s*\{\s*grid-template-columns:\s*repeat\(2,/

test("the Settings layout is the container its grid measures", () => {
	expect(app).toMatch(/\.settings-layout\s*\{[^}]*container:\s*settings\s*\/\s*inline-size;/)
})

test("two columns only from 900px and while the layout holds 40rem, so an open panel stacks them", () => {
	const wide = blocks(app, "@media (min-width: 900px)")
	const inContainer = wide.flatMap((css) => blocks(css, "@container settings (min-width: 40rem)"))
	expect(inContainer.some((css) => twoColumns.test(css))).toBe(true)
	// Not also as a plain 900px rule, which would hold two columns beside the panel.
	expect(wide.some((css) => twoColumns.test(css.replace(/@container[^{]*\{[^}]*\{[^}]*\}\s*\}/g, "")))).toBe(false)
})
