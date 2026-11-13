// @vitest-environment node
import { expect, test } from "vitest"

import SiteHeader from "#components/organisms/SiteHeader.astro"
import TabBar from "#components/organisms/TabBar.astro"
import { createContainer, parseHtml } from "../../container"

/**
 * Under the ClientRouter (PRD DD-174) the page's content cross-fades on a navigation, but the
 * shell holds still: the header and the tab bar don't animate, and the date island persists, so
 * it isn't hydrated afresh on every page.
 */
const source = (path: string) => Bun.file(path).text()

test("the header doesn't animate between pages", async () => {
	expect(await source("src/components/organisms/SiteHeader.astro")).toMatch(
		/<header class="site-header" id="site-header" transition:animate="none">/,
	)
})

/**
 * A view transition captures each named element as its own box. The bottom bar is
 * `position: fixed`, so the `#tabbar` slot around it has no height: naming the slot held still
 * an empty box, and the bar faded out with the page. The fixed box carries the name itself.
 */
test("the bottom bar holds still between pages, not its empty slot", async () => {
	const doc = parseHtml(await (await createContainer()).renderToString(TabBar, { props: { current: "home" } }))
	const scope = (selector: string) => doc.querySelector(selector)?.getAttribute("data-astro-transition-scope")
	expect(scope(".tabbar")).toBeTruthy()
	expect(scope("#tabbar")).toBeFalsy()
})

test("the date island persists across pages", async () => {
	const html = await (await createContainer()).renderToString(SiteHeader, {
		props: { build: { environment: "production", pr: "" } },
	})
	expect(parseHtml(html).querySelector("astro-island")?.hasAttribute("data-astro-transition-persist")).toBe(true)
})
