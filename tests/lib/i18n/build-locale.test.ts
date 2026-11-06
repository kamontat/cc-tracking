// @vitest-environment node
import { expect, test } from "vitest"

import SettingsPanels from "#components/organisms/SettingsPanels.svelte"
import { getLocale, resetLocale, t } from "#lib/i18n/index"
import { createContainer, parseHtml } from "../../container"

/**
 * At build time there is no reader: no saved pick and no browser languages, which in a browser
 * would mean Thai. The build writes English instead, as the static copy does (PRD DD-171), so an
 * island's built frame and the copy around it agree; the browser then reads the reader's own.
 */
test("with no browser, the locale is English, whatever languages the runtime reports", () => {
	resetLocale()
	expect(getLocale()).toBe("en")
	expect(t("nav.cards")).toBe("Cards")
})

test("an island's built frame reads English, like the static copy beside it", async () => {
	resetLocale()
	const doc = parseHtml(await (await createContainer()).renderToString(SettingsPanels))
	expect([...doc.querySelectorAll("section.set-section > h2")].map((h) => h.textContent?.trim())).toEqual([
		"Display",
		"Locations",
		"Backup",
		"Reset",
		"About",
	])
})
