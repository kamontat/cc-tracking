// @vitest-environment node
import { describe, expect, test } from "vitest"

import Tabs from "#components/molecules/Tabs.astro"
import { en } from "#lib/i18n/en"
import { TABS } from "#lib/ui/tabs"
import { createContainer } from "../../container"

const render = async (props: Record<string, unknown>) => (await createContainer()).renderToString(Tabs, { props })

const links = (html: string) => [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((m) => m[0])

describe("Tabs", () => {
	test("links the four places in order, each with its icon and its translated label", async () => {
		const html = await render({ variant: "bar" })
		const anchors = links(html)
		expect(anchors.map((a) => a.match(/data-tab="(\w+)"/)?.[1])).toEqual(["home", "transactions", "cards", "settings"])
		expect(anchors.map((a) => a.match(/href="([^"]*)"/)?.[1])).toEqual(["/", "/transactions", "/cards", "/settings"])
		for (const [index, anchor] of anchors.entries()) {
			const { label } = TABS[index] ?? { label: "nav.home" }
			expect(anchor).toMatch(/<svg[^>]*class="icon"/)
			expect(anchor).toContain(`<span data-i18n="${label}">${en[label]}</span>`)
		}
	})

	test("marks only the current tab", async () => {
		const anchors = links(await render({ variant: "bar", current: "cards" }))
		expect(anchors.map((a) => a.includes('aria-current="page"'))).toEqual([false, false, true, false])
	})

	test("marks none on a page outside the four places", async () => {
		expect(await render({ variant: "bar" })).not.toContain("aria-current")
	})

	test("is a named nav whose name is translated", async () => {
		const html = await render({ variant: "bar" })
		expect(html).toMatch(/<nav[^>]*aria-label="Pages"/)
		expect(html).toMatch(/<nav[^>]*data-i18n-aria-label="nav.pages"/)
	})

	test("takes the header's or the bottom bar's class", async () => {
		expect(await render({ variant: "header" })).toMatch(/<nav[^>]*class="site-header__tabs"/)
		expect(await render({ variant: "bar" })).toMatch(/<nav[^>]*class="tabbar"/)
	})

	test("holds nothing but the four links", async () => {
		const html = await render({ variant: "bar" })
		const inside = html.match(/<nav[^>]*>([\s\S]*)<\/nav>/)?.[1] ?? ""
		expect(inside.replace(/<a\b[\s\S]*?<\/a>/g, "").trim()).toBe("")
	})
})
