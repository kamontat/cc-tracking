import { compile } from "svelte/compiler"
import { describe, expect, it } from "vitest"

/**
 * Every Svelte component compiles without a warning, so `bun run test` stays quiet and a new
 * warning (a stale prop read, an unused selector, an a11y miss) fails here instead of
 * scrolling past in the log.
 */
const components = Array.from(new Bun.Glob("**/*.svelte").scanSync({ cwd: "src/components" })).sort()

describe("Svelte components", () => {
	it.each(components)("%s compiles without warnings", async (component) => {
		const filename = `src/components/${component}`
		const { warnings } = compile(await Bun.file(filename).text(), { filename })
		expect(warnings.map((warning) => `${warning.code} at ${warning.start?.line}:${warning.start?.column}`)).toEqual([])
	})
})
