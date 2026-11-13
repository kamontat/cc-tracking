// @vitest-environment node
import { existsSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"

const file = join(import.meta.dirname, "..", "..", "svelte.config.js")

test("svelte.config.js is there, so vite-plugin-svelte finds a config, and keeps Svelte's defaults", async () => {
	expect(existsSync(file)).toBe(true)
	const { default: config } = await import(file)
	expect(config).toEqual({})
})
