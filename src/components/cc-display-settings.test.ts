import { beforeEach, expect, test } from "vitest"
import "#components/cc-display-settings"
import { getLocale, resetLocale, setLocale } from "#lib/i18n/index"

beforeEach(() => {
	globalThis.localStorage.clear()
	document.documentElement.removeAttribute("data-theme")
	resetLocale()
	setLocale("en")
})

const mount = async () => {
	document.body.innerHTML = ""
	const element = document.createElement("cc-display-settings")
	document.body.append(element)
	await element.updateComplete
	return element
}

const row = (element: HTMLElement, name: string) => {
	const found = element.shadowRoot?.querySelector<HTMLElement>(`.set-row[data-row="${name}"]`)
	if (!found) throw new Error(`no ${name} row`)
	return found
}

/** The segmented choices in row `name`, by their locale-invariant `data-value`. */
const choices = (element: HTMLElement, name: string) => [
	...row(element, name).querySelectorAll<HTMLButtonElement>(".seg button[data-value]"),
]

const pressed = (element: HTMLElement, name: string) =>
	choices(element, name)
		.filter((button) => button.getAttribute("aria-pressed") === "true")
		.map((button) => button.getAttribute("data-value"))

const press = (element: HTMLElement, name: string, value: string) => {
	const button = choices(element, name).find((choice) => choice.getAttribute("data-value") === value)
	if (!button) throw new Error(`no ${value} in ${name}`)
	button.click()
}

test("lays the language and theme out as two rows, each named", async () => {
	const element = await mount()

	expect(
		[...(element.shadowRoot?.querySelectorAll(".set-row") ?? [])].map((found) => found.getAttribute("data-row")),
	).toEqual(["language", "theme"])
	expect(row(element, "language").textContent).toContain("Language")
	expect(row(element, "theme").textContent).toContain("Theme")
	expect(element.shadowRoot?.querySelector("h2")).toBeNull()
})

test("offers both languages, each in its own script, and marks the current one", async () => {
	const element = await mount()

	expect(choices(element, "language").map((b) => b.getAttribute("data-value"))).toEqual(["en", "th"])
	expect(choices(element, "language").map((b) => b.textContent?.trim())).toEqual(["English", "ไทย"])
	expect(pressed(element, "language")).toEqual(["en"])
})

test("pressing a language changes the locale and persists it", async () => {
	const element = await mount()
	press(element, "language", "th")
	await element.updateComplete

	expect(getLocale()).toBe("th")
	expect(globalThis.localStorage.getItem("cc:lang")).toBe("th")
	expect(pressed(element, "language")).toEqual(["th"])
})

test("the language follows a locale change made elsewhere", async () => {
	const element = await mount()
	setLocale("th")
	await element.updateComplete

	expect(pressed(element, "language")).toEqual(["th"])
})

test("offers light, dark and the device's theme, starting on the device", async () => {
	const element = await mount()

	expect(choices(element, "theme").map((b) => b.getAttribute("data-value"))).toEqual(["light", "dark", "system"])
	expect(choices(element, "theme").map((b) => b.textContent?.trim())).toEqual(["Light", "Dark", "Device"])
	expect(pressed(element, "theme")).toEqual(["system"])
})

test("pressing a theme stamps the root and persists it", async () => {
	const element = await mount()
	press(element, "theme", "dark")
	await element.updateComplete

	expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
	expect(globalThis.localStorage.getItem("cc:theme")).toBe("dark")
	expect(pressed(element, "theme")).toEqual(["dark"])
})

test("shows a saved theme on a fresh mount", async () => {
	globalThis.localStorage.setItem("cc:theme", "light")
	const element = await mount()

	expect(pressed(element, "theme")).toEqual(["light"])
})
