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

/** Language and theme are picked on the settings page, not in every page's header. */
test("no route page carries a language picker in its header", async () => {
	const offenders: string[] = [];

	for await (const path of new Glob("src/routes/*.html").scan(".")) {
		const source = await Bun.file(path).text();
		if (source.includes("<cc-lang-switch>")) offenders.push(path);
	}

	expect(offenders).toEqual([]);
});

/**
 * The dark palette is written twice in tokens.css -- once for a device in dark mode with no
 * explicit pick, once for an explicit dark pick -- because CSS cannot share one declaration
 * block between a media query and a plain selector. This keeps the two copies identical.
 */
test("both dark palettes in the tokens declare the same values", async () => {
	const source = await Bun.file("src/styles/tokens.css").text();
	const blockAfter = (marker: string): string => {
		const at = source.indexOf(marker);
		if (at < 0) throw new Error(`no ${marker} in tokens.css`);
		const start = source.indexOf("{", at);
		let depth = 0;
		for (let index = start; index < source.length; index++) {
			if (source[index] === "{") depth++;
			if (source[index] === "}" && --depth === 0) {
				return source.slice(start + 1, index);
			}
		}
		throw new Error(`unclosed block after ${marker}`);
	};
	const declarations = (block: string) =>
		block
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.split(";")
			.map((line) => line.trim())
			.filter(Boolean);

	const system = declarations(blockAfter(':root:not([data-theme="light"])'));
	const picked = declarations(blockAfter(':root[data-theme="dark"]'));

	expect(system.length).toBeGreaterThan(0);
	expect(picked).toEqual(system);
});
