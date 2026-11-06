import { expect, test } from "vitest"

import { en } from "#lib/i18n/en"
import { th } from "#lib/i18n/th"

/**
 * A `data-i18n` key in `.astro` markup is a plain string, so the type checker can't see a typo
 * or a key missing from one catalog; the copy pass would quietly leave the English. This reads
 * every key the markup names and holds it to both catalogs (PRD DD-171). A key written as an
 * expression (`data-i18n={tab.label}`) is typed as a `MessageKey` where it comes from instead.
 */
test("every data-i18n key in the markup is in both catalogs", async () => {
	const problems: string[] = []
	for await (const path of new Bun.Glob("src/**/*.astro").scan(".")) {
		const source = await Bun.file(path).text()
		for (const [, key = ""] of source.matchAll(/data-i18n(?:-aria-label|-title)?="([^"]*)"/g)) {
			if (!(key in en)) problems.push(`${path}: ${key} is not in en.ts`)
			if (!(key in th)) problems.push(`${path}: ${key} is not in th.ts`)
		}
	}
	expect(problems).toEqual([])
})
