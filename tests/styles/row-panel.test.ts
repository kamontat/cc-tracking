import { expect, test } from "vitest"

/** UI-22: the one row panel of the light DOM, `.row-panel` in app.css, and the lists that take it. */
const app = await Bun.file("src/styles/app.css").text()

/** The declarations of the first rule whose selector list holds `selector` exactly. */
const rule = (css: string, selector: string): Map<string, string> => {
	for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selectors = (match[1] ?? "")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.split(",")
			.map((s) => s.trim())
		if (!selectors.includes(selector)) continue
		const out = new Map<string, string>()
		for (const line of (match[2] ?? "").split(";")) {
			const at = line.indexOf(":")
			if (at > 0) out.set(line.slice(0, at).trim(), line.slice(at + 1).trim())
		}
		return out
	}
	throw new Error(`no rule for ${selector}`)
}

/** The panel and divider every row list draws (the Lit `rowPanel` they replaced drew the same). */
const PANEL = {
	background: "var(--cc-surface)",
	border: "var(--cc-border-width) solid var(--cc-border)",
	"border-radius": "var(--cc-radius-md)",
	padding: "0 var(--cc-space-4)",
}
const DIVIDER = "var(--cc-border-width) solid var(--cc-border)"

test(".row-panel carries the panel's ground, border, radius and padding", () => {
	const light = rule(app, ".row-panel")
	for (const [prop, value] of Object.entries(PANEL)) expect(light.get(prop)).toBe(value)
})

test(".row-panel's divider outranks a row's border reset", () => {
	expect(rule(app, ".row-panel > * + *").get("border-top")).toBe(DIVIDER)
	expect(rule(app, ".page .row-panel > * + *").get("border-top")).toBe(DIVIDER)
})

test(".set and .saved-lines take the panel from .row-panel", () => {
	for (const name of [".set", ".saved-lines"]) {
		expect(rule(app, name).get("border")).toBe(PANEL.border)
		expect(rule(app, name).get("padding")).toBe(PANEL.padding)
	}
	expect(() => rule(app, ".saved-lines li + li")).toThrow()
})

// An island or slot sits between the `.set` panel and these rows, so they draw the rule themselves.
test.each(["src/components/molecules/DisplaySettings.svelte", "src/components/molecules/About.astro"])(
	"%s draws the same divider as the row panel",
	async (path) => {
		const style = (await Bun.file(path).text()).split("<style>")[1] ?? ""
		expect(rule(style, ".set-row + .set-row").get("border-top")).toBe(DIVIDER)
	},
)

// DD-109: a statement's hovered head is the same square band as every other row's, reaching the
// panel's inner edges, not a rounded pill whose corners stop at the panel's border.
test("a card's statement head hovers square, edge to edge", async () => {
	const style = (await Bun.file("src/components/organisms/CardStatements.svelte").text()).split("<style>")[1] ?? ""
	expect(rule(style, ".panel .crow").get("border-radius")).toBe("0")
})
