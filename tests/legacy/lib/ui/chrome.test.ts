import { expect, test } from "vitest"

import { applyChrome } from "#legacy/lib/ui/chrome"
import { setLocale } from "#lib/i18n/index"

const mount = () => {
	document.body.innerHTML = `
		<header class="site-header" id="site-header"></header>
		<main class="page" id="page"></main>
		<div id="tabbar"></div>`
}

test("title carries the build mark", () => {
	mount()
	const cases = [
		["preview", "42", "Cards — cc-tracking (pr-42)"],
		["local", "", "Cards — cc-tracking (local)"],
		["production", "", "Cards — cc-tracking"],
		["preview", "", "Cards — cc-tracking (preview)"],
	] as const
	for (const [environment, pr, title] of cases) {
		applyChrome("title.cards", { build: { environment, pr } })
		expect(document.title).toBe(title)
	}
})

test("stamps the build on the root", () => {
	mount()
	for (const environment of ["development", "local", "preview", "production"] as const) {
		applyChrome("title.cards", { build: { environment, pr: "" } })
		expect(document.documentElement.getAttribute("data-env")).toBe(environment)
	}
})

test("a language switch re-titles the page", () => {
	mount()
	applyChrome("title.settings", { build: { environment: "production", pr: "" } })
	setLocale("th")
	expect(document.title).toBe("ตั้งค่า — cc-tracking")
	expect(document.documentElement.lang).toBe("th")
})

test("leaves the header and the tab bar to the Astro shell (AppLayout)", () => {
	mount()
	applyChrome("title.settings", { build: { environment: "production", pr: "" } })
	expect(document.querySelector("#site-header")?.innerHTML).toBe("")
	expect(document.querySelector("#tabbar")?.innerHTML).toBe("")
})
