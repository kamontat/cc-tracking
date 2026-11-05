import { describe, expect, test } from "vitest"

import { GROUP_COLORS } from "#lib/domain/group-color"

const css = await Bun.file(`${import.meta.dirname}/tokens.css`).text()

/** The body of the first rule whose selector line is exactly `selector`. */
function block(selector: string): string {
	const start = css.indexOf(`${selector} {`)
	if (start < 0) throw new Error(`no block for ${selector}`)
	const open = css.indexOf("{", start)
	return css.slice(open + 1, css.indexOf("}", open))
}

const blocks = {
	light: block(":root"),
	"dark (system)": block(':root:not([data-theme="light"])'),
	"dark (explicit)": block(':root[data-theme="dark"]'),
}

function value(body: string, name: string): string | undefined {
	return body.match(new RegExp(`--cc-${name}:\\s*(#[0-9a-f]{6});`))?.[1]
}

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
	}) as [number, number, number]
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
	return (hi + 0.05) / (lo + 0.05)
}

// Today's values for the first four, which the stored names must keep wearing.
const legacy = {
	light: {
		blue: ["#e3e9fb", "#3552b8"],
		green: ["#dff1e7", "#2f7457"],
		purple: ["#efe5f7", "#7a45a8"],
		orange: ["#fbe6dd", "#a74e2c"],
	},
	dark: {
		blue: ["#1f2944", "#9fb3f5"],
		green: ["#1b3328", "#8ed7b4"],
		purple: ["#2e2240", "#cfa6ef"],
		orange: ["#3a241b", "#f2a882"],
	},
} as const

describe("group colour tokens", () => {
	for (const [label, body] of Object.entries(blocks)) {
		const dark = label.startsWith("dark")
		describe(label, () => {
			for (const name of GROUP_COLORS) {
				test(`${name} defines ground, text and soft`, () => {
					expect(value(body, `group-${name}`)).toBeDefined()
					expect(value(body, `group-${name}-text`)).toBeDefined()
					expect(value(body, `group-${name}-soft`)).toBeDefined()
				})

				test(`${name} text reads on its ground and soft tint (4.5:1)`, () => {
					const text = value(body, `group-${name}-text`) as string
					expect(contrast(text, value(body, `group-${name}`) as string)).toBeGreaterThanOrEqual(4.5)
					expect(contrast(text, value(body, `group-${name}-soft`) as string)).toBeGreaterThanOrEqual(4.5)
				})
			}

			for (const [name, [ground, text]] of Object.entries(legacy[dark ? "dark" : "light"])) {
				test(`${name} keeps today's values`, () => {
					expect(value(body, `group-${name}`)).toBe(ground as string)
					expect(value(body, `group-${name}-text`)).toBe(text as string)
				})
			}
		})
	}

	test("soft tint sits toward the surface", () => {
		for (const name of GROUP_COLORS) {
			const light = blocks.light
			const surface = value(light, "surface") as string
			const ground = value(light, `group-${name}`) as string
			const soft = value(light, `group-${name}-soft`) as string
			expect(contrast(soft, surface)).toBeLessThan(contrast(ground, surface))
		}
	})
})
