// @vitest-environment node
import { describe, expect, test } from "vitest"

import SubHeader from "#components/molecules/SubHeader.astro"
import { ICON_PATHS } from "#lib/ui/icon-paths"
import { createContainer, parseHtml } from "../../container"

/**
 * A sub page's compact heading: a back link and the page's title, translated in the browser.
 * The same markup the legacy `subHeader` draws, so app.css styles both alike.
 */
const render = async (props: Record<string, unknown>) =>
	parseHtml(await (await createContainer()).renderToString(SubHeader, { props }))

describe("SubHeader", () => {
	test("a back link to the page above, named Back in the reader's language", async () => {
		const doc = await render({ titleKey: "settings.locations.title", back: "/settings" })
		const back = doc.querySelector('.sub-header a[data-action="back"]')
		expect(back?.getAttribute("href")).toBe("/settings")
		expect(back?.getAttribute("aria-label")).toBe("Back")
		expect(back?.getAttribute("data-i18n-aria-label")).toBe("common.back")
		expect(ICON_PATHS.back).toContain(`d="${back?.querySelector("svg.icon path")?.getAttribute("d")}"`)
	})

	test("the title as the page's heading, translated through data-i18n", async () => {
		const doc = await render({ titleKey: "settings.locations.title", back: "/settings" })
		const title = doc.querySelector(".sub-header h1 .sub-header__title")
		expect(title?.textContent).toBe("Locations")
		expect(title?.getAttribute("data-i18n")).toBe("settings.locations.title")
	})
})
