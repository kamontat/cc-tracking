import { expect, test } from "bun:test";
import { Glob } from "bun";
import { en } from "#lib/i18n/en";

/**
 * Catches a user-visible sentence left hard-coded in a template. Not exhaustive — it looks
 * for the shape of English prose inside a Lit template — but it fails loudly on the most
 * common way this regresses: someone adds a feature and forgets the catalog.
 */
test("no component or route renders a hard-coded English sentence", async () => {
	// Widened to `Set<string>`: `en` is declared `as const`, so `Object.values(en)` is a
	// union of literal types, and `values.has(text)` would otherwise reject the plain
	// `string` captured from the regex before this ever runs.
	const values = new Set<string>(Object.values(en));
	const offenders: string[] = [];

	for await (const path of new Glob("src/{components,routes}/*.ts").scan(".")) {
		if (path.endsWith(".test.ts")) continue;
		const source = await Bun.file(path).text();
		for (const [, text] of source.matchAll(
			/>\s*([A-Z][A-Za-z]+(?: [a-z]+){2,})\s*</g,
		)) {
			if (text && !values.has(text)) offenders.push(`${path}: ${text}`);
		}
	}

	expect(offenders).toEqual([]);
});
