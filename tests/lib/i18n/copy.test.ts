import { beforeEach, describe, expect, test } from "vitest"

import { applyCopy, startCopy } from "#lib/i18n/copy"
import { en } from "#lib/i18n/en"
import { setLocale } from "#lib/i18n/index"
import { th } from "#lib/i18n/th"

/**
 * Static `.astro` markup ships English with its catalog key (PRD DD-171); this pass swaps it
 * to the reader's locale in the browser.
 */
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
