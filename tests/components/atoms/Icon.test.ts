// @vitest-environment node
import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { expect, test } from "vitest"

import Icon from "#components/atoms/Icon.astro"
import { ICON_PATHS } from "#lib/ui/icon-paths"

const render = async (name: keyof typeof ICON_PATHS) => {
	const container = await AstroContainer.create()
	return container.renderToString(Icon, { props: { name } })
}

test("draws the named icon on the shared 24-unit grid, in the current text colour", async () => {
	const html = await render("cards")
	expect(html).toMatch(/<svg[^>]*class="icon"/)
	expect(html).toContain('viewBox="0 0 24 24"')
	expect(html).toContain('stroke="currentColor"')
	expect(html).toContain(ICON_PATHS.cards)
})

test("is decorative: hidden from assistive technology and out of the tab order", async () => {
	const html = await render("home")
	expect(html).toContain('aria-hidden="true"')
	expect(html).toContain('focusable="false"')
})

test("every icon has its own drawing", () => {
	const drawings = Object.values(ICON_PATHS)
	expect(new Set(drawings).size).toBe(drawings.length)
	for (const drawing of drawings) expect(drawing).toMatch(/^<(path|rect|circle)\b/)
})
