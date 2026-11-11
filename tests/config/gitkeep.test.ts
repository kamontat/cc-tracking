import { readdirSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "vitest"

const ROOTS = ["src", "tests", "public", "scripts"]
const SKIP = new Set(["node_modules", "dist", ".astro"])

/** Every `.gitkeep` under `dir`, with how many other entries share its folder. */
function placeholders(dir: string): { path: string; others: number }[] {
	let entries: import("node:fs").Dirent[]
	try {
		entries = readdirSync(dir, { withFileTypes: true })
	} catch {
		return []
	}
	const found = entries.some((e) => e.name === ".gitkeep")
		? [{ path: join(dir, ".gitkeep"), others: entries.filter((e) => e.name !== ".gitkeep").length }]
		: []
	return [
		...found,
		...entries.filter((e) => e.isDirectory() && !SKIP.has(e.name)).flatMap((e) => placeholders(join(dir, e.name))),
	]
}

test("a .gitkeep only holds an empty folder", () => {
	const unused = ROOTS.flatMap(placeholders).filter((p) => p.others > 0)
	expect(unused.map((p) => p.path)).toEqual([])
})
