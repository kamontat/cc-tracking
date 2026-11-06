// @vitest-environment node
import { expect, test } from "vitest"

import SiteHeader from "#components/organisms/SiteHeader.astro"
import { createContainer, parseHtml } from "../../container"

/**
 * Under the ClientRouter (PRD DD-174) the page's content cross-fades on a navigation, but the
 * shell holds still: the header and the tab bar don't animate, and the date island persists, so
 * it isn't hydrated afresh on every page.
 */
const source = (path: string) => Bun.file(path).text()

test("the header and the tab bar don't animate between pages", async () => {
	expect(await source("src/components/organisms/SiteHeader.astro")).toMatch(
		/<header class="site-header" id="site-header" transition:animate="none">/,
	)
	expect(await source("src/components/organisms/TabBar.astro")).toMatch(/<div id="tabbar" transition:animate="none">/)
})

test("the date island persists across pages", async () => {
	const html = await (await createContainer()).renderToString(SiteHeader, {
		props: { build: { environment: "production", pr: "" } },
	})
	expect(parseHtml(html).querySelector("astro-island")?.hasAttribute("data-astro-transition-persist")).toBe(true)
})
