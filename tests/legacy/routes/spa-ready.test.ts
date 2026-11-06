import { describe, expect, test } from "vitest"

/**
 * Under the ClientRouter (PRD DD-174) a route module is imported once but its page may be
 * visited many times, so a route starts from `start()` (called by `onPage`), never on import,
 * and whatever a page sets up beyond its own DOM passes `pageSignal()` so it goes when the
 * reader leaves. These read the legacy sources to keep both true.
 */
const read = async (glob: string) => {
	const found: [string, string][] = []
	for await (const path of new Bun.Glob(glob).scan(".")) found.push([path, await Bun.file(path).text()])
	return found
}

/** The route modules the pages load: the module each page's script imports. */
const entries = async () => {
	const modules: string[] = []
	for (const [, source] of await read("src/pages/**/*.astro")) {
		const [, route] = source.match(/from "#legacy\/routes\/([^"]+)"/) ?? []
		if (route) modules.push(`src/legacy/routes/${route}.ts`)
	}
	return modules.sort()
}

describe("legacy routes under the ClientRouter", () => {
	test("every page's route module exports start, and none starts itself on import", async () => {
		const modules = await entries()
		expect(modules).toHaveLength(11)
		for (const path of modules) {
			const source = await Bun.file(path).text()
			expect(source, path).toMatch(/^export (const|function) start\b/m)
			expect(source, path).not.toMatch(/^bootstrap\(/m)
		}
	})

	test("every language listener a page sets up goes with the page", async () => {
		const files = [...(await read("src/legacy/routes/**/*.ts")), ...(await read("src/legacy/lib/ui/{page,chrome}.ts"))]
		const unscoped = files.flatMap(([path, source]) =>
			[...source.matchAll(/\bsubscribe\(([^\n]*)/g)]
				.filter(([, rest]) => !rest?.includes("pageSignal()"))
				.map(([call]) => `${path}: ${call}`),
		)
		expect(unscoped).toEqual([])
	})

	// The router keeps its own state ({ index, scrollX, scrollY }) on each page's history entry and
	// ignores entries without it. Rewriting the address in place keeps that state, or Back later
	// lands on an entry the router skips and the page doesn't change. (An in-page entry a page
	// pushes, such as an open sheet, stays without state on purpose: the router leaves its Back to
	// the page's own popstate handler.)
	test("rewriting the address in place keeps the router's history state", async () => {
		const wiping = (await read("src/legacy/routes/**/*.ts")).flatMap(([path, source]) =>
			[...source.matchAll(/replaceState\(null\b[^\n]*/g)].map(([call]) => `${path}: ${call}`),
		)
		expect(wiping).toEqual([])
	})

	test("every popstate handler a page adds goes with the page", async () => {
		const unscoped = (await read("src/legacy/routes/**/*.ts")).flatMap(([path, source]) =>
			[...source.matchAll(/addEventListener\("popstate"[^\n]*/g)]
				.filter(([call]) => !call.includes("pageSignal()"))
				.map(([call]) => `${path}: ${call}`),
		)
		expect(unscoped).toEqual([])
	})
})
