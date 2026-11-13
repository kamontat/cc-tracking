// @vitest-environment node
import { describe, expect, test } from "vitest"

import PageTabs from "#components/molecules/PageTabs.astro"
import { en } from "#lib/i18n/en"
import { createContainer, parseHtml } from "../../container"

const TABS = [
	{ href: "/cards", label: "cards.tab.cards" },
	{ href: "/cards/limits", label: "cards.tab.limits" },
] as const

const render = async (current: string) =>
	parseHtml(
		await (await createContainer()).renderToString(PageTabs, {
			props: { title: "cards.title", label: "cards.tabs", tabs: TABS, current },
		}),
	)

describe("PageTabs", () => {
	test("heads the page with its translated title", async () => {
		const h1 = (await render("/cards")).querySelector("h1")
		expect(h1?.getAttribute("data-i18n")).toBe("cards.title")
		expect(h1?.textContent).toBe(en["cards.title"])
	})

	test("links every tab in order, each its own address with its translated label", async () => {
		const links = [...(await render("/cards")).querySelectorAll("nav a")]
		expect(links.map((a) => a.getAttribute("href"))).toEqual(["/cards", "/cards/limits"])
		expect(links.map((a) => a.querySelector("span")?.getAttribute("data-i18n"))).toEqual([
			"cards.tab.cards",
			"cards.tab.limits",
		])
		expect(links.map((a) => a.textContent?.trim())).toEqual([en["cards.tab.cards"], en["cards.tab.limits"]])
	})

	test("marks only the tab on show", async () => {
		const marked = (doc: Awaited<ReturnType<typeof render>>) =>
			[...doc.querySelectorAll("nav a")].map((a) => a.getAttribute("aria-current"))
		expect(marked(await render("/cards"))).toEqual(["page", null])
		expect(marked(await render("/cards/limits"))).toEqual([null, "page"])
	})

	test("is a nav named in the reader's language", async () => {
		const nav = (await render("/cards")).querySelector("nav")
		expect(nav?.getAttribute("aria-label")).toBe(en["cards.tabs"])
		expect(nav?.getAttribute("data-i18n-aria-label")).toBe("cards.tabs")
		expect(nav?.classList.contains("page-tabs__nav")).toBe(true)
	})

	test("puts the title, a divider and the tabs in one bar, in that order", async () => {
		const bar = (await render("/cards")).querySelector(".page-tabs")
		expect([...(bar?.children ?? [])].map((child) => child.tagName)).toEqual(["H1", "SPAN", "NAV"])
		const divider = bar?.children[1]
		expect(divider?.classList.contains("page-tabs__divider")).toBe(true)
		expect(divider?.getAttribute("aria-hidden")).toBe("true")
		expect(divider?.textContent).toBe("")
	})

	test("draws one rule under the whole bar, and only the tabs scroll sideways", async () => {
		const css = (await Bun.file("src/components/molecules/PageTabs.astro").text()).split("<style>")[1] ?? ""
		const rule = (selector: string) => css.match(new RegExp(`\\n\\t${selector} \\{([^}]*)\\}`))?.[1] ?? ""
		expect(rule("\\.page-tabs")).toMatch(/border-block-end: var\(--cc-border-width\) solid var\(--cc-border\)/)
		expect(rule("\\.page-tabs")).toMatch(/flex-direction: row/)
		expect(rule("nav")).not.toMatch(/border-block-end/)
		expect(rule("nav")).toMatch(/overflow-x: auto/)
		expect(rule("nav")).toMatch(/scrollbar-width: none/)
		expect(rule("\\.page-tabs__title")).toMatch(/font-size: var\(--cc-text-xl\)/)
		expect(rule("\\.page-tabs__title")).toMatch(/flex: none/)
	})

	test("holds nothing in the nav but the links", async () => {
		const nav = (await render("/cards")).querySelector("nav")
		expect([...(nav?.children ?? [])].every((child) => child.tagName === "A")).toBe(true)
	})
})
