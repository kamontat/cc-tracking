import { beforeEach, describe, expect, test } from "vitest"

import { applyCopy, startCopy } from "#lib/i18n/copy"
import { en } from "#lib/i18n/en"
import { setLocale } from "#lib/i18n/index"
import { th } from "#lib/i18n/th"
import { buildInfo, titleMark } from "#lib/ui/build-info"

/**
 * Static `.astro` markup ships English with its catalog key (PRD DD-171); this pass swaps it
 * to the reader's locale in the browser.
 */
/** The declarations app.css gives `selector`, comments dropped. */
const appRule = async (selector: string) => {
	const css = (await Bun.file("src/styles/app.css").text()).replace(/\/\*[\s\S]*?\*\//g, "")
	return css.match(new RegExp(`${selector.replace(/[[\]()*.^$|?+]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? ""
}

test("a Thai page hides its static copy until the pass has run", async () => {
	expect(await appRule('html[lang="th"]:not([data-i18n-ready]) [data-i18n]')).toContain("visibility: hidden")
})

// An island's built frame is English (PRD DD-171); Astro drops `ssr` once the island runs in
// the reader's language, so a Thai reader never sees that English either.
test("a Thai page hides an island's built frame until the island runs", async () => {
	expect(await appRule('html[lang="th"] astro-island[ssr]')).toContain("visibility: hidden")
})

const markup = () => {
	document.body.innerHTML = `
		<h2 data-i18n="nav.cards">Cards</h2>
		<p class="plain">Not translated</p>
		<span data-i18n="no.such.key">Kept as written</span>
	`
}

beforeEach(() => {
	document.documentElement.removeAttribute("data-i18n-ready")
	document.documentElement.lang = "en"
	markup()
})

const text = (selector: string) => document.querySelector(selector)?.textContent

describe("applyCopy", () => {
	test("swaps each keyed element to the reader's locale", () => {
		setLocale("th")
		applyCopy(document)
		expect(text("h2")).toBe(th["nav.cards"])
	})

	test("leaves English in place for English readers", () => {
		setLocale("en")
		applyCopy(document)
		expect(text("h2")).toBe(en["nav.cards"])
	})

	test("touches nothing without a key, and keeps the English for a key the catalog lacks", () => {
		setLocale("th")
		applyCopy(document)
		expect(text(".plain")).toBe("Not translated")
		expect(text("span")).toBe("Kept as written")
	})

	test("only reaches inside the root it is given", () => {
		setLocale("th")
		const section = document.createElement("section")
		section.innerHTML = `<b data-i18n="nav.home">Home</b>`
		document.body.append(section)
		applyCopy(section)
		expect(text("b")).toBe(th["nav.home"])
		expect(text("h2")).toBe("Cards")
	})
})

describe("applyCopy on the document title", () => {
	// An Astro page names its title's key; the pass translates it and adds the build's mark,
	// as the legacy applyChrome does for Lit pages.
	test("translates a keyed <title> and keeps the build mark", () => {
		document.head.innerHTML = `<title data-i18n-title="title.locations">Locations — cc-tracking</title>`
		setLocale("th")
		applyCopy(document)
		const { environment, pr } = buildInfo()
		expect(document.title).toBe(`${th["title.locations"]}${titleMark(environment, pr)}`)
		document.head.innerHTML = ""
	})

	test("leaves a title without a key alone", () => {
		document.head.innerHTML = `<title>Plain</title>`
		setLocale("th")
		applyCopy(document)
		expect(document.title).toBe("Plain")
		document.head.innerHTML = ""
	})
})

describe("applyCopy on an aria-label", () => {
	test("swaps a keyed aria-label and leaves the element's own text", () => {
		document.body.innerHTML = `<nav data-i18n-aria-label="nav.pages" aria-label="Pages">Links</nav>`
		setLocale("th")
		applyCopy(document)
		const nav = document.querySelector("nav")
		expect(nav?.getAttribute("aria-label")).toBe(th["nav.pages"])
		expect(nav?.textContent).toBe("Links")
	})

	test("keeps the English aria-label for a key the catalog lacks", () => {
		document.body.innerHTML = `<nav data-i18n-aria-label="no.such.key" aria-label="Pages"></nav>`
		setLocale("th")
		applyCopy(document)
		expect(document.querySelector("nav")?.getAttribute("aria-label")).toBe("Pages")
	})
})

describe("startCopy across a ClientRouter swap", () => {
	// A swap brings the next page's English markup and resets <html>'s attributes to the shipped
	// ones (lang="en", no data-i18n-ready), so the pass runs again after the swap (PRD DD-174).
	test("translates the swapped-in page and marks it ready again", () => {
		setLocale("th")
		const stop = startCopy(document)
		document.body.innerHTML = `<h2 data-i18n="nav.settings">Settings</h2>`
		document.documentElement.lang = "en"
		document.documentElement.removeAttribute("data-i18n-ready")
		document.dispatchEvent(new Event("astro:after-swap"))
		expect(text("h2")).toBe(th["nav.settings"])
		expect(document.documentElement.lang).toBe("th")
		expect(document.documentElement.hasAttribute("data-i18n-ready")).toBe(true)
		stop()
	})

	test("stops following swaps once stopped", () => {
		setLocale("th")
		startCopy(document)()
		document.body.innerHTML = `<h2 data-i18n="nav.settings">Settings</h2>`
		document.dispatchEvent(new Event("astro:after-swap"))
		expect(text("h2")).toBe("Settings")
	})
})

describe("startCopy", () => {
	test("applies the copy, sets the page language and marks the page ready", () => {
		setLocale("th")
		// The page ships `lang="en"`; setLocale set it too, so put the shipped value back.
		document.documentElement.lang = "en"
		const stop = startCopy(document)
		expect(text("h2")).toBe(th["nav.cards"])
		expect(document.documentElement.lang).toBe("th")
		expect(document.documentElement.hasAttribute("data-i18n-ready")).toBe(true)
		stop()
	})

	test("follows a later change of language", () => {
		setLocale("th")
		const stop = startCopy(document)
		setLocale("en")
		expect(text("h2")).toBe(en["nav.cards"])
		expect(document.documentElement.lang).toBe("en")
		stop()
		setLocale("th")
		expect(text("h2")).toBe(en["nav.cards"])
	})
})
