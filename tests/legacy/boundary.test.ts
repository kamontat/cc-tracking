import { describe, expect, test } from "vitest"

/**
 * The Lit code waiting to be converted lives in src/legacy/ (PRD DD-170, DD-172). Legacy may
 * use src/lib/, but nothing else may lean on legacy, so each conversion can delete its Lit
 * file without breaking the new code, and the folder only ever shrinks.
 */
const sources = async () => {
	const found: [string, string][] = []
	for await (const path of new Bun.Glob("src/**/*.{ts,astro,svelte}").scan(".")) {
		found.push([path, await Bun.file(path).text()])
	}
	return found
}

const specifiers = (text: string) => [...text.matchAll(/(?:from|import)\s+"([^"]+)"/g)].map((m) => m[1] as string)

describe("src/legacy", () => {
	test("holds every file that imports lit", async () => {
		const outside = (await sources())
			.filter(([path]) => !path.startsWith("src/legacy/"))
			.filter(([, text]) => specifiers(text).some((spec) => spec === "lit" || spec.startsWith("lit/")))
			.map(([path]) => path)
		expect(outside).toEqual([])
	})

	test("is imported by nothing outside it except a page's route script", async () => {
		const offenders: string[] = []
		for (const [path, text] of await sources()) {
			if (path.startsWith("src/legacy/")) continue
			for (const spec of specifiers(text)) {
				if (!spec.startsWith("#legacy/")) continue
				// A page runs its legacy route module until its last Lit piece is converted.
				if (path.startsWith("src/pages/") && spec.startsWith("#legacy/routes/")) continue
				offenders.push(`${path} -> ${spec}`)
			}
		}
		expect(offenders).toEqual([])
	})

	test("leaves no component file outside an atomic tier", async () => {
		const loose = (await sources())
			.map(([path]) => path)
			.filter((path) => /^src\/components\/[^/]+\.(ts|astro|svelte)$/.test(path))
		expect(loose).toEqual([])
	})

	test("leaves no route module outside it", async () => {
		const routes = (await sources()).map(([path]) => path).filter((path) => path.startsWith("src/routes/"))
		expect(routes).toEqual([])
	})
})
