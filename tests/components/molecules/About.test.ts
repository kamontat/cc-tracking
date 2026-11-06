// @vitest-environment node
import type { BuildInfo } from "#lib/ui/build-info"

import { expect, test } from "vitest"

import About from "#components/molecules/About.astro"
import { CHANGELOG_URL, commitUrl, REPO_URL } from "#lib/ui/build-info"
import { createContainer, parseHtml } from "../../container"

/**
 * Settings > About names the build the page is served from. Everything but the build time is
 * known when the page is built, so the rows are static; the time is read in the viewer's own
 * zone and language, so it is an island. Ported from the legacy `cc-about` tests.
 */
const SHA = "3270f3d9c1a4e8b2f6d0a7c5e9b1d3f2a4c6e8b0"

const production: BuildInfo = {
	commit: SHA,
	builtAt: "2026-10-30T07:05:00Z",
	pr: "",
	environment: "production",
	branch: "main",
}

type Doc = ReturnType<typeof parseHtml>

const render = async (build: BuildInfo) =>
	parseHtml(await (await createContainer()).renderToString(About, { props: { build } }))

const rows = (doc: Doc) => [...doc.querySelectorAll("[data-row]")].map((row) => row.getAttribute("data-row"))

const value = (doc: Doc, row: string) => doc.querySelector(`[data-row="${row}"] dd`)

const link = (doc: Doc, row: string) => value(doc, row)?.querySelector("a") ?? null

test("production shows every row", async () => {
	const doc = await render(production)

	expect(rows(doc)).toEqual(["environment", "built", "source", "commit", "changelog"])
	expect(value(doc, "environment")?.textContent?.trim()).toBe("Production")
	expect(link(doc, "source")?.textContent?.trim()).toBe("main")
	expect(link(doc, "source")?.getAttribute("href")).toBe(REPO_URL)
	expect(link(doc, "commit")?.textContent?.trim()).toBe("3270f3d")
	expect(link(doc, "commit")?.getAttribute("href")).toBe(commitUrl(SHA))
	expect(link(doc, "changelog")?.getAttribute("href")).toBe(CHANGELOG_URL)
})

test("the build time is an island carrying the stamp", async () => {
	const island = value(await render(production), "built")?.querySelector("astro-island")
	expect(island?.getAttribute("client")).toBe("load")
	expect(island?.getAttribute("props")).toContain("2026-10-30T07:05:00Z")
})

test("every label and translated value carries its key", async () => {
	const doc = await render(production)

	expect([...doc.querySelectorAll("dt")].map((dt) => dt.getAttribute("data-i18n"))).toEqual([
		"about.environment",
		"about.built",
		"about.source",
		"about.commit",
		"about.changelog",
	])
	expect(value(doc, "environment")?.querySelector("[data-i18n]")?.getAttribute("data-i18n")).toBe(
		"about.env.production",
	)
	expect(link(doc, "changelog")?.getAttribute("data-i18n")).toBe("about.whatsNew")
})

test("links open in a new tab", async () => {
	const doc = await render(production)
	for (const row of ["source", "commit", "changelog"]) {
		expect(link(doc, row)?.getAttribute("target")).toBe("_blank")
		expect(link(doc, row)?.getAttribute("rel")).toBe("noreferrer")
	}
})

test("preview names its pull request", async () => {
	const doc = await render({ ...production, environment: "preview", pr: "31", branch: "redesign-phase-2" })

	expect(link(doc, "source")?.textContent?.trim()).toBe("#31 · redesign-phase-2")
	expect(rows(doc)).toContain("commit")
	expect(rows(doc)).not.toContain("changelog")
})

test("local hides commit and changelog", async () => {
	expect(rows(await render({ ...production, environment: "local" }))).toEqual(["environment", "built", "source"])
})

test("development hides the build time", async () => {
	const doc = await render({ ...production, environment: "development", branch: "" })

	expect(rows(doc)).toEqual(["environment", "source"])
	expect(link(doc, "source")?.textContent?.trim()).toBe("kamontat/cc-tracking")
})

test("an unreadable build time is hidden", async () => {
	for (const builtAt of ["", "not a date"]) {
		expect(rows(await render({ ...production, builtAt }))).not.toContain("built")
	}
})

test("draws each row as a settings row and leaves the heading to the page", async () => {
	const doc = await render(production)

	expect([...doc.querySelectorAll("[data-row]")].every((found) => found.classList.contains("set-row"))).toBe(true)
	expect(doc.querySelector("h2")).toBeNull()
})
