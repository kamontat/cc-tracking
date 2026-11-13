// @vitest-environment node
import { describe, expect, test } from "vitest"

import FabMenu from "#components/molecules/FabMenu.astro"
import { ICON_PATHS } from "#lib/ui/icon-paths"
import { payAddress } from "#lib/ui/pay-address"
import { createContainer } from "../../container"

/**
 * The floating *+ New* button (PRD DD-104) opens its menu as an HTML popover: the browser gives
 * the open and close, the tap outside and Escape, with no script (PRD DD-173).
 */
const render = async () => (await createContainer()).renderToString(FabMenu)

describe("FabMenu", () => {
	test("the button opens the menu as a popover", async () => {
		const html = await render()
		const target = html.match(/<button[^>]*popovertarget="([^"]+)"/)?.[1]
		expect(target).toBeTruthy()
		expect(html).toMatch(new RegExp(`<div[^>]*id="${target}"[^>]*popover`))
		expect(html).toMatch(/<button[^>]*type="button"/)
	})

	test("the button is named New, in the reader's language, with a + and a label", async () => {
		const html = await render()
		const button = html.match(/<button[\s\S]*?<\/button>/)?.[0] ?? ""
		expect(button).toMatch(/aria-label="New"/)
		expect(button).toMatch(/data-i18n-aria-label="fab.new"/)
		expect(button).toContain(`<span class="fab__label" data-i18n="fab.new">New</span>`)
		expect(button).toContain(ICON_PATHS.plus)
	})

	test("the menu holds the two ways to start, each with its icon and translated label", async () => {
		const html = await render()
		const items = [...html.matchAll(/<a\b[^>]*class="fab-menu__item"[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0])
		expect(items.map((a) => a.match(/href="([^"]*)"/)?.[1])).toEqual(["/transactions/lists/new", payAddress()])
		expect(items.map((a) => a.match(/data-action="([^"]*)"/)?.[1])).toEqual(["new-list", "pay"])
		expect(items[0]).toContain(ICON_PATHS.list)
		expect(items[0]).toContain(`<span data-i18n="fab.newList">`)
		expect(items[1]).toContain(ICON_PATHS.wallet)
		expect(items[1]).toContain(`<span data-i18n="fab.pay">`)
	})

	test("ships no script", async () => {
		expect(await render()).not.toMatch(/<script/)
	})
})
