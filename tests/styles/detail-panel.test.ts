import { expect, test } from "vitest"

/**
 * The detail panel (RD-23, DD-196) fits the screen: its head stays put and only its body scrolls,
 * so reading the panel never scrolls the page. Layout is CSS, which happy-dom doesn't lay out, so
 * these hold the rules; the sizes themselves are checked in a browser.
 */
const tokens = await Bun.file("src/styles/tokens.css").text()
const app = await Bun.file("src/styles/app.css").text()
const more = (await Bun.file("src/components/molecules/MoreMenu.svelte").text()).split("<style>")[1] ?? ""
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

test("the column's place is tokens: under the header, above the page's foot, at the page's end edge", () => {
	expect(tokens).toMatch(/--cc-page-foot:\s*calc\(/)
	expect(tokens).toMatch(/--cc-detail-column-top:\s*calc\(var\(--cc-header-height\) \+ var\(--cc-space-5\)\);/)
	// The page is centred up to --cc-page-width with --cc-space-4 of padding; a fixed box's 100% is the
	// screen's width without its scrollbar, so the column lines up with the page's content edge.
	expect(tokens).toMatch(
		/--cc-detail-column-end:\s*calc\(\(100% - min\(100%, var\(--cc-page-width\)\)\) \/ 2 \+ var\(--cc-space-4\)\);/,
	)
	// Its height is no longer a guess at what sits above it (a tab bar did not count).
	expect(tokens).not.toMatch(/--cc-detail-column-height:/)
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

test("from 900px the panel is fixed to the screen: under the header, above the page's foot, whatever sits above the list", () => {
	const column = rule(wide(panel), ".detail-panel")
	expect(column.get("position")).toBe("fixed")
	expect(column.get("top")).toBe("var(--cc-detail-column-top)")
	expect(column.get("bottom")).toBe("var(--cc-page-foot)")
	expect(column.get("inset-inline-start")).toBe("auto")
	expect(column.get("inset-inline-end")).toBe("var(--cc-detail-column-end)")
	expect(column.get("inline-size")).toBe("var(--cc-detail-panel)")
	expect(column.get("block-size")).toBe("auto")
	expect(column.has("max-block-size")).toBe(false)
})

test("from 900px the page makes room on its end side for the open panel, tabs and list alike", () => {
	const room = rule(wide(app), ".page:has(.panel-layout[data-panel])")
	expect(room.get("padding-inline-end")).toBe("calc(var(--cc-space-4) + var(--cc-detail-panel) + var(--cc-space-5))")
	// The panel is out of the flow, so the list keeps one column.
	expect(app).not.toMatch(
		/\.panel-layout\[data-panel\]\s*\{\s*grid-template-columns: minmax\(0, 1fr\) var\(--cc-detail-panel\)/,
	)
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

test("the head's buttons are one set: as tall as an icon control, square when an icon, one radius", () => {
	expect(tokens).toMatch(/--cc-control-size:\s*calc\(var\(--cc-icon-size\) \+ 2 \* var\(--cc-space-2\)\);/)
	const every = rule(panel, ".detail-panel__bar :global(button[data-variant])")
	expect(every.get("block-size")).toBe("var(--cc-control-size)")
	// On the title's centre line, not `.page button`'s flex-start.
	expect(every.get("align-self")).toBe("center")
	expect(every.get("padding-block")).toBe("0")
	expect(every.get("border-radius")).toBe("var(--cc-radius-sm)")
	const icon = rule(panel, ".detail-panel .detail-panel__icon")
	expect(icon.get("inline-size")).toBe("var(--cc-control-size)")
	expect(icon.get("padding")).toBe("0")
	// ⋯ is the same square wherever the menu sits.
	const trigger = rule(more, "button.more[data-variant]")
	expect(trigger.get("inline-size")).toBe("var(--cc-control-size)")
	expect(trigger.get("block-size")).toBe("var(--cc-control-size)")
	expect(trigger.get("padding")).toBe("0")
})
