import { expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * Every page shows one person's own data from their browser, so none belongs in a search
 * index -- the production site and every `pr-*` preview alike. Two layers, so either alone
 * still works: a `noindex` meta on each page, and an `X-Robots-Tag` header on every response
 * (which also covers the bundles, the favicon and anything a future page forgets).
 *
 * There is deliberately no `robots.txt` with `Disallow: /`: a crawler barred from a page never
 * reads its `noindex`, and can still index the bare address from a link elsewhere.
 */
const NOINDEX = '<meta name="robots" content="noindex, nofollow" />';

test("every page asks not to be indexed", async () => {
	const missing: string[] = [];
	for await (const path of new Glob("src/routes/**/*.html").scan(".")) {
		const source = await Bun.file(path).text();
		if (!source.includes(NOINDEX)) missing.push(path);
	}
	expect(missing).toEqual([]);
});

test("every response carries the noindex header", async () => {
	const headers = await Bun.file("public/_headers").text();
	expect(headers).toContain("/*\n  X-Robots-Tag: noindex, nofollow");
});

test("no robots.txt blocks crawlers from reading the noindex", async () => {
	expect(await Bun.file("public/robots.txt").exists()).toBe(false);
});
