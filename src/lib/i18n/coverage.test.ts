import { expect, test } from "bun:test";
import { Glob } from "bun";
import { en } from "#lib/i18n/en";

/**
 * Catches a user-visible sentence left hard-coded in a template. Not exhaustive — it looks
 * for the shape of English prose inside a Lit template — but it fails loudly on the most
 * common way this regresses: someone adds a feature and forgets the catalog.
 *
 * Known blind spots, left as acceptable residual risk rather than chased here:
 * - A sentence that starts with a single-letter capitalised word ("A missing card.",
 *   "I could not save that.") does not match `[A-Z][A-Za-z]+`, which requires at least two
 *   letters in the first word.
 * - A sentence broken by a `${...}` interpolation ("Edit ${name} now") does not match, since
 *   the pattern requires a single unbroken run of words between `>` and `<`.
 * - The glob is not recursive, so a component or route nested in a subdirectory of
 *   `src/components` or `src/routes` would not be scanned.
 * The pattern does tolerate one trailing `.`, `?`, or `!` before the closing tag, so ordinary
 * sentence and question punctuation — the shape of most confirmation and error copy — does
 * not defeat the match the way it would without that allowance.
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
			/>\s*([A-Z][A-Za-z]+(?: [a-z]+){2,}[.?!]?)\s*</g,
		)) {
			if (text && !values.has(text)) offenders.push(`${path}: ${text}`);
		}
	}

	expect(offenders).toEqual([]);
});
