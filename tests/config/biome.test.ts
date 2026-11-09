// @vitest-environment node
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const root = join(import.meta.dirname, "..", "..")
const dir = mkdtempSync(join(import.meta.dirname, "fixture-"))

afterAll(() => rmSync(dir, { recursive: true, force: true }))

// Runs `biome <command>` on a temporary .astro file with the project's biome.json.
const biome = (command: "lint" | "format", source: string, ...flags: string[]) => {
	const file = join(dir, "Fixture.astro")
	writeFileSync(file, source)
	const result = spawnSync("bunx", ["biome", command, ...flags, file], { cwd: root, encoding: "utf8" })
	return { ...result, output: result.stdout + result.stderr }
}

describe("biome.json", () => {
	it("extends the astro preset", () => {
		const config = JSON.parse(readFileSync(join(root, "biome.json"), "utf8"))
		expect(config.extends).toContain("@kcconfigs/biome/configs/astro")
	})

	// The agents' skill folders are copied from upstream as they are: formatting rewrites their
	// front matter (`allowed-tools` globs turn from `*` to `_`), so Biome leaves them alone.
	it("leaves the agents' folders unformatted", () => {
		const config = JSON.parse(readFileSync(join(root, "biome.json"), "utf8"))
		expect(config.files.includes).toEqual(expect.arrayContaining(["!.claude", "!.opencode"]))
	})

	// Every page imports BaseLayout only to use it in the template; `bun run format` must keep it.
	it("does not flag frontmatter imports and variables used only in the template", () => {
		const result = biome(
			"lint",
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
		expect(result.output).toMatch(/Checked 1 file/)
		expect(result.output).not.toMatch(/noUnused|useConst|useImportType/)
		expect(result.status).toBe(0)
	})

	// The frontmatter follows the same style as every .ts file: no semicolons. Biome skips
	// `.astro` files when formatting unless its HTML formatter is on.
	it("formats .astro frontmatter like the TypeScript", () => {
		const { output } = biome("format", '---\nconst title = "Home";\n---\n\n<h1>{title}</h1>\n', "--write")
		expect(output).toMatch(/Formatted 1 file/)
		expect(readFileSync(join(dir, "Fixture.astro"), "utf8")).toContain('const title = "Home"\n')
	})
})
