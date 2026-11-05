// @vitest-environment node
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const root = join(import.meta.dirname, "..", "..")
const dir = mkdtempSync(join(import.meta.dirname, "fixture-"))

afterAll(() => rmSync(dir, { recursive: true, force: true }))

// Lints a temporary .astro file with the project's biome.json.
const lint = (source: string) => {
	const file = join(dir, "Fixture.astro")
	writeFileSync(file, source)
	return spawnSync("bunx", ["biome", "lint", file], { cwd: root, encoding: "utf8" })
}

describe("biome.json", () => {
	it("extends the astro preset", () => {
		const config = JSON.parse(readFileSync(join(root, "biome.json"), "utf8"))
		expect(config.extends).toContain("@kcconfigs/biome/configs/astro")
	})

	// Every page imports BaseLayout only to use it in the template; `bun run format` must keep it.
	it("does not flag frontmatter imports and variables used only in the template", () => {
		const result = lint(
			[
				"---",
				'import BaseLayout from "#layouts/BaseLayout.astro"',
				'let title = "Home"',
				"---",
				"",
				"<BaseLayout title={title} />",
				"",
			].join("\n"),
		)
		expect(result.stdout + result.stderr).not.toMatch(/noUnused|useConst|useImportType/)
		expect(result.status).toBe(0)
	})
})
