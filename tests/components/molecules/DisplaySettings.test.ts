import { flushSync, mount, unmount } from "svelte"
import { afterEach, beforeEach, expect, test } from "vitest"

import DisplaySettings from "#components/molecules/DisplaySettings.svelte"
import { getLocale, setLocale } from "#lib/i18n/index"

/**
 * The reader's display choices (RD-19): language and colour theme, two settings rows each with
 * a segmented choice. Both live in this browser's storage, not the repository. Ported from the
 * legacy `cc-display-settings` tests, against the same markup in light DOM.
 */
let mounted: ReturnType<typeof mount> | undefined

beforeEach(() => {
	document.documentElement.removeAttribute("data-theme")
})

afterEach(() => {
	if (mounted) unmount(mounted)
	mounted = undefined
	document.body.innerHTML = ""
})

const show = () => {
	document.body.innerHTML = ""
	mounted = mount(DisplaySettings, { target: document.body })
	flushSync()
	return document.body
}

const row = (root: HTMLElement, name: string) => {
	const found = root.querySelector<HTMLElement>(`.set-row[data-row="${name}"]`)
	if (!found) throw new Error(`no ${name} row`)
	return found
}

/** The segmented choices in row `name`, by their locale-invariant `data-value`. */
const choices = (root: HTMLElement, name: string) => [
	...row(root, name).querySelectorAll<HTMLButtonElement>(".seg button[data-value]"),
]

const pressed = (root: HTMLElement, name: string) =>
	choices(root, name)
		.filter((button) => button.getAttribute("aria-pressed") === "true")
		.map((button) => button.getAttribute("data-value"))

const press = (root: HTMLElement, name: string, value: string) => {
	const button = choices(root, name).find((choice) => choice.getAttribute("data-value") === value)
	if (!button) throw new Error(`no ${value} in ${name}`)
	button.click()
	flushSync()
}

test("lays the language and theme out as two rows, each named", () => {
	const root = show()

	expect([...root.querySelectorAll(".set-row")].map((found) => found.getAttribute("data-row"))).toEqual([
		"language",
		"theme",
	])
	expect(row(root, "language").textContent).toContain("Language")
	expect(row(root, "theme").textContent).toContain("Theme")
	expect(root.querySelector("h2")).toBeNull()
})

test("names each choice group by its row's label", () => {
	const root = show()
	for (const name of ["language", "theme"]) {
		const label = row(root, name).querySelector("fieldset.seg")?.getAttribute("aria-labelledby")
		expect(label && root.querySelector(`#${label}`)?.textContent).toBeTruthy()
	}
})

test("offers both languages, each in its own script, and marks the current one", () => {
	const root = show()

	expect(choices(root, "language").map((b) => b.getAttribute("data-value"))).toEqual(["en", "th"])
	expect(choices(root, "language").map((b) => b.textContent?.trim())).toEqual(["English", "ไทย"])
	expect(choices(root, "language").map((b) => b.getAttribute("lang"))).toEqual(["en", "th"])
	expect(pressed(root, "language")).toEqual(["en"])
})

test("pressing a language changes the locale and persists it", () => {
	const root = show()
	press(root, "language", "th")

	expect(getLocale()).toBe("th")
	expect(globalThis.localStorage.getItem("cc:lang")).toBe("th")
	expect(pressed(root, "language")).toEqual(["th"])
	expect(row(root, "theme").textContent).not.toContain("Theme")
})

test("the language follows a locale change made elsewhere", () => {
	const root = show()
	setLocale("th")
	flushSync()

	expect(pressed(root, "language")).toEqual(["th"])
})

test("offers light, dark and the device's theme, starting on the device", () => {
	const root = show()

	expect(choices(root, "theme").map((b) => b.getAttribute("data-value"))).toEqual(["light", "dark", "system"])
	expect(choices(root, "theme").map((b) => b.textContent?.trim())).toEqual(["Light", "Dark", "Device"])
	expect(pressed(root, "theme")).toEqual(["system"])
})

test("pressing a theme stamps the root and persists it", () => {
	const root = show()
	press(root, "theme", "dark")

	expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
	expect(globalThis.localStorage.getItem("cc:theme")).toBe("dark")
	expect(pressed(root, "theme")).toEqual(["dark"])
})

test("shows a saved theme on a fresh mount", () => {
	globalThis.localStorage.setItem("cc:theme", "light")
	const root = show()

	expect(pressed(root, "theme")).toEqual(["light"])
})
