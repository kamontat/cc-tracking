import { expect, test } from "vitest"

import { detectLocale } from "#lib/i18n/index"

/**
 * The inline boot in BaseLayout sets `<html lang>` before anything paints, so the CSS can hide
 * Thai pages' static copy until the copy pass has run (PRD DD-171). It can't import
 * `detectLocale`, so it repeats the rule; these hold the two to the same answer.
 */
const BOOT = /<script is:inline data-astro-rerun data-theme-boot>([\s\S]*?)<\/script>/

const bootText = async () => {
	const source = await Bun.file("src/layouts/BaseLayout.astro").text()
	return source.match(BOOT)?.[1] ?? ""
}

const run = (text: string, saved: string | null, languages: readonly string[] | undefined) => {
	const root = document.createElement("html")
	root.setAttribute("lang", "en")
	const storage = { getItem: (key: string) => (key === "cc:lang" ? saved : null) }
	new Function("localStorage", "document", "location", "navigator", text)(
		storage,
		{ documentElement: root },
		{ hostname: "localhost" },
		languages === undefined ? undefined : { languages },
	)
	return root.getAttribute("lang")
}

const SAVED = [null, "en", "th", "fr", ""]
const LANGUAGES: (readonly string[])[] = [[], ["en-US", "en"], ["th-TH"], ["fr", "th"], ["fr", "de"], ["EN-gb"]]

test("the boot picks the same language as detectLocale", async () => {
	const text = await bootText()
	for (const saved of SAVED) {
		for (const languages of LANGUAGES) {
			expect(run(text, saved, languages), `${saved} ${languages.join(",")}`).toBe(detectLocale(saved, languages))
		}
	}
})

test("no navigator falls back as detectLocale does with no languages", async () => {
	expect(run(await bootText(), null, undefined)).toBe(detectLocale(null, []))
})

test("blocked storage still picks from the browser's languages", async () => {
	const root = document.createElement("html")
	new Function("localStorage", "document", "location", "navigator", await bootText())(
		{
			getItem: () => {
				throw new Error("SecurityError")
			},
		},
		{ documentElement: root },
		{ hostname: "localhost" },
		{ languages: ["en-US"] },
	)
	expect(root.getAttribute("lang")).toBe("en")
})
