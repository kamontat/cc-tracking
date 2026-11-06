// @vitest-environment node
import { expect, test } from "vitest"

import HeaderDate from "#components/atoms/HeaderDate.svelte"
import { createContainer } from "../../container"

/** At build time there is no reader yet: the island ships its frame, empty (PRD DD-172). */
test("renders the empty frame at build time, both forms in place for the stylesheet", async () => {
	const html = await (await createContainer()).renderToString(HeaderDate)
	expect(html).toMatch(/<span class="site-header__date-short"><\/span>/)
	expect(html).toMatch(/<span class="site-header__date-long"><\/span>/)
})
