// @vitest-environment node
import { describe, expect, test } from "vitest"

import SiteHeader from "#components/organisms/SiteHeader.astro"
import { createContainer, parseHtml } from "../../container"

type Build = { environment: "development" | "local" | "preview" | "production"; pr: string }

const render = async (props: { current?: string; build?: Build } = {}) =>
	(await createContainer()).renderToString(SiteHeader, {
		props: { build: { environment: "production", pr: "" }, ...props },
	})

/** The classes of an element's direct children, in order. */
const childClasses = (html: string, parentClass: string) => {
	const doc = parseHtml(html)
	return [...(doc.querySelector(`.${parentClass}`)?.children ?? [])].map((child) => child.className)
}

const domOf = (html: string) => parseHtml(html)

describe("SiteHeader", () => {
	test("is the page's header slot, one row: the brand run, then the tabs", async () => {
		const html = await render({ current: "cards" })
		expect(html).toMatch(/<header[^>]*class="site-header"[^>]*id="site-header"/)
		expect(childClasses(html, "site-header__bar")).toEqual(["site-header__id", "site-header__tabs"])
	})

	test("brand, build mark, a hidden dot, then the date, as one run", async () => {
		const html = await render({ build: { environment: "preview", pr: "30" } })
		expect(childClasses(html, "site-header__id")).toEqual([
			"site-header__brand",
			"site-header__env",
			"site-header__sep",
			"site-header__date",
		])
		const doc = domOf(html)
		const dot = doc.querySelector(".site-header__sep")
		expect(dot?.textContent).toBe("·")
		expect(dot?.getAttribute("aria-hidden")).toBe("true")
		// The brand link wraps only the mark and the name, never the build mark or the date.
		const brand = doc.querySelector(".site-header__brand")
		expect(brand?.textContent).toBe("cctracking")
		expect(brand?.getAttribute("href")).toBe("/")
		expect(brand?.getAttribute("aria-label")).toBe("cc-tracking")
	})

	test("the build mark per build, as plain text, and none in production", async () => {
		const mark = async (build: Build) =>
			domOf(await render({ build })).querySelector('[data-testid="env-mark"]')?.textContent ?? null
		expect(await mark({ environment: "development", pr: "" })).toBe("(dev)")
		expect(await mark({ environment: "local", pr: "" })).toBe("(local)")
		expect(await mark({ environment: "preview", pr: "42" })).toBe("(pr-42)")
		expect(await mark({ environment: "preview", pr: "" })).toBe("(preview)")
		expect(await mark({ environment: "production", pr: "" })).toBeNull()
	})

	test("the date is an island the browser fills, carrying both forms", async () => {
		const html = await render()
		const date = domOf(html).querySelector('[data-testid="today"]')
		expect(date?.className).toBe("site-header__date")
		expect(date?.querySelector("astro-island")).not.toBeNull()
		expect(date?.querySelector(".site-header__date-short")).not.toBeNull()
		expect(date?.querySelector(".site-header__date-long")).not.toBeNull()
	})

	test("the tabs mark the page's place, and the header has no Payment link", async () => {
		const doc = domOf(await render({ current: "transactions" }))
		const current = [...doc.querySelectorAll(".site-header__tabs a")].map((a) => a.getAttribute("aria-current"))
		expect(current).toEqual([null, "page", null, null])
		expect(doc.querySelector('.site-header a[href^="/pay"]')).toBeNull()
	})
})
