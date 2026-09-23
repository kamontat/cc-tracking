import { expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * Every page carries the Google Tag Manager container, or none of its traffic is counted.
 * The snippets live in the static HTML rather than in a route module because GTM wants to
 * run before the bundle does, and because a route whose script fails to load should still
 * report the visit.
 *
 * This is the one guard against a new route being added without them -- the pages are five
 * near-identical copies, and the copy that gets forgotten is invisible until someone reads
 * the numbers and wonders why one page has none.
 *
 * The loader is kept byte-identical to what Google publishes, so a future version of it can
 * be diffed rather than re-ported. It is ES5 minified code, so it trips four style rules
 * meant for code we write; biome.json turns those off for `src/routes/*.html`, which holds no
 * other inline JavaScript. The one change made to the published snippet is a `title` on the
 * noscript iframe, which the a11y rule asks for and GTM does not care about.
 */
const CONTAINER = "GTM-5TMJN4ZX";

const pages = async (): Promise<[string, string][]> => {
	const found: [string, string][] = [];
	for await (const path of new Glob("src/routes/*.html").scan(".")) {
		found.push([path, await Bun.file(path).text()]);
	}
	return found.sort(([a], [b]) => (a < b ? -1 : 1));
};

test("there are pages to check at all", async () => {
	expect((await pages()).length).toBeGreaterThan(0);
});

test("every page loads the container before its own bundle", async () => {
	for (const [path, source] of await pages()) {
		expect(`${path}: ${source.includes(CONTAINER)}`).toBe(`${path}: true`);
		// Ahead of the module script: GTM's own snippet asks to be as high in the head as
		// possible, and a bundle that throws must not take the tag down with it.
		expect(`${path}: gtm before bundle`).toBe(
			`${path}: ${
				source.indexOf("googletagmanager.com/gtm.js") <
				source.indexOf('<script type="module"')
					? "gtm before bundle"
					: "bundle before gtm"
			}`,
		);
	}
});

test("every page carries the noscript fallback, first thing in the body", async () => {
	for (const [path, source] of await pages()) {
		expect(`${path}: ${source.includes("googletagmanager.com/ns.html")}`).toBe(
			`${path}: true`,
		);
		const body = source.slice(source.indexOf("<body>"));
		expect(`${path}: noscript before header`).toBe(
			`${path}: ${
				body.indexOf("<noscript>") < body.indexOf("<header")
					? "noscript before header"
					: "header before noscript"
			}`,
		);
	}
});
