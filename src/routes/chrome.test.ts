import { expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * The footer lives in each route's static HTML, the way the header and nav already do, so a
 * new route added without it is caught here rather than shipping a page that names no build.
 */
test("every route page carries the site footer", async () => {
	const missing: string[] = [];

	for await (const path of new Glob("src/routes/*.html").scan(".")) {
		const source = await Bun.file(path).text();
		if (!source.includes("<cc-site-footer>")) missing.push(path);
	}

	expect(missing).toEqual([]);
});
