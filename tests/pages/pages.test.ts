// @vitest-environment node
// Astro's renderer mistakes a page for a framework component under happy-dom's globals.

import type { AstroComponentFactory } from "astro/runtime/server/index.js"

import { expect, test } from "vitest"

import { createContainer, parseHtml } from "../container"

/**
 * Every page is the same shell -- `AppLayout` over `BaseLayout` -- with its own title, tab,
 * `<main>` width and island. These read each page's source and render it, so a page that
 * skips the layout, or a layout that drops a piece every page needs, fails here rather than on
 * the preview.
 */
const pages = Array.from(new Bun.Glob("**/*.astro").scanSync({ cwd: "src/pages" })).sort()

const source = (page: string) => Bun.file(`src/pages/${page}`).text()

const render = async (page: string) => {
	const module = (await import(`../../src/pages/${page}`)) as {
		default: AstroComponentFactory
	}
	const container = await createContainer()
	return container.renderToString(module.default)
}

test("src/pages has every page", () => {
	expect(pages).toEqual([
		"card.astro",
		"card/edit.astro",
		"card/new.astro",
		"cards.astro",
		"cards/limits.astro",
		"index.astro",
		"list/draft.astro",
		"list/new.astro",
		"list/reply.astro",
		"list/view.astro",
		"owed.astro",
		"pay.astro",
		"ready.astro",
		"settings.astro",
		"settings/locations.astro",
		"transactions.astro",
		"transactions/lists.astro",
		"transactions/lists/edit.astro",
		"transactions/lists/new.astro",
	])
})

const layouts = Array.from(new Bun.Glob("*.astro").scanSync({ cwd: "src/layouts" })).map((file) =>
	file.replace(/\.astro$/, ""),
)

// Layouts a source file imports through #layouts/* and renders as a tag.
const usedLayouts = (text: string) =>
	[...text.matchAll(/^import (\w+) from "#layouts\/(\w+)\.astro";?$/gm)]
		.filter(([, local]) => new RegExp(`<${local}\\b`).test(text))
		.map(([, , layout]) => layout as string)

// True when the layout is BaseLayout or renders one that reaches it.
const reachesBase = async (layout: string, seen = new Set<string>()): Promise<boolean> => {
	if (layout === "BaseLayout") return true
	if (seen.has(layout)) return false
	seen.add(layout)
	const text = await Bun.file(`src/layouts/${layout}.astro`).text()
	for (const inner of usedLayouts(text)) {
		if (await reachesBase(inner, seen)) return true
	}
	return false
}

test.each(pages)("%s renders inside BaseLayout, which loads Google Tag Manager", async (page) => {
	const used = usedLayouts(await source(page))
	expect(used.length).toBeGreaterThan(0)
	for (const layout of used) expect(await reachesBase(layout)).toBe(true)
})

test.each(layouts)("layout %s wraps BaseLayout", async (layout) => {
	expect(await reachesBase(layout)).toBe(true)
})

// Every page renders into <main> through AppLayout's `main` slot, with its own title key; no page
// has a route script any more (the Lit routes are gone, DD-185).
test.each(pages)("%s renders its content in <main> and translates its title", async (page) => {
	const text = await source(page)
	expect(text).not.toContain("#legacy/")
	expect(text).not.toContain("onPage(")
	const doc = parseHtml(await render(page))
	const main = doc.querySelector("main#page")
	expect(main?.hasAttribute("data-route")).toBe(false)
	expect(main?.children.length).toBeGreaterThan(0)
	expect(doc.querySelector("title")?.getAttribute("data-i18n-title")).toMatch(/^title\./)
})

test("AppLayout names no route on <main>", async () => {
	const layout = await Bun.file("src/layouts/AppLayout.astro").text()
	expect(layout).not.toContain("data-route")
	expect(layout).not.toMatch(/\broute\?:/)
})

test.each(pages)("%s carries the shell its island renders into", async (page) => {
	const html = await render(page)
	// English until the bundle runs; the locale boot then sets the reader's language.
	expect(html).toContain('<html lang="en"')
	expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
	for (const id of ["site-header", "page", "tabbar"]) expect(html).toContain(`id="${id}"`)
	expect(html).toMatch(/<main class="page[ "]/)
	expect(html).toMatch(/<title[^>]*>.+ — cc-tracking<\/title>/)
})

test("the theme boots before anything paints", async () => {
	const html = await render("index.astro")
	const boot = html.indexOf("<script data-astro-rerun data-theme-boot>")
	expect(boot).toBeGreaterThan(-1)
	expect(boot).toBeLessThan(html.indexOf("<link"))
	expect(html.match(/data-theme-boot/g)).toHaveLength(1)
})

test("each page keeps the width it asks for", async () => {
	const widths: Record<string, string> = {}
	for (const page of pages) {
		widths[page] = (await render(page)).match(/<main class="([^"]*)"/)?.[1] ?? ""
	}
	expect(widths).toEqual({
		"card.astro": "page card-page",
		"card/edit.astro": "page page--form",
		"card/new.astro": "page page--form",
		"cards.astro": "page",
		"cards/limits.astro": "page",
		"index.astro": "page",
		"list/draft.astro": "page page--narrow",
		"list/new.astro": "page page--narrow",
		"list/reply.astro": "page page--narrow",
		"list/view.astro": "page page--narrow",
		"owed.astro": "page",
		"pay.astro": "page page--narrow",
		"ready.astro": "page",
		"settings.astro": "page",
		"settings/locations.astro": "page page--form",
		"transactions.astro": "page",
		"transactions/lists.astro": "page",
		"transactions/lists/edit.astro": "page page--narrow",
		"transactions/lists/new.astro": "page page--narrow",
	})
})

test("each page marks its place in both navs, and steps + New aside when mid-task", async () => {
	const shell: Record<string, string> = {}
	for (const page of pages) {
		const doc = parseHtml(await render(page))
		const header = doc.querySelector('.site-header__tabs [aria-current="page"]')?.getAttribute("data-tab")
		const bar = doc.querySelector('.tabbar [aria-current="page"]')?.getAttribute("data-tab")
		expect(bar, page).toBe(header)
		shell[page] = `${header ?? "none"}${doc.querySelector(".fab-menu") ? " +new" : ""}`
	}
	// The payment page sits under Transactions; a card's pages under Cards; Locations under
	// Settings; Home's three tabs and the old purchase list pages under Home, the new ones under
	// Transactions (RD-26).
	// + New steps aside on the payment page, the list pages and the card form (PRD DD-104).
	expect(shell).toEqual({
		"card.astro": "cards +new",
		"card/edit.astro": "cards",
		"card/new.astro": "cards",
		"cards.astro": "cards +new",
		"cards/limits.astro": "cards +new",
		"index.astro": "home +new",
		"list/draft.astro": "home",
		"list/new.astro": "home",
		"list/reply.astro": "home",
		"list/view.astro": "home",
		"owed.astro": "home +new",
		"pay.astro": "transactions",
		"ready.astro": "home +new",
		"settings.astro": "settings +new",
		"settings/locations.astro": "settings +new",
		"transactions.astro": "transactions +new",
		"transactions/lists.astro": "transactions +new",
		"transactions/lists/edit.astro": "transactions",
		"transactions/lists/new.astro": "transactions",
	})
})

test("Cards and Limits head the page with the title and the Cards · Limits tabs, the one on show marked", async () => {
	for (const [page, current] of [
		["cards.astro", "/cards"],
		["cards/limits.astro", "/cards/limits"],
	] as const) {
		const doc = parseHtml(await render(page))
		const main = doc.querySelector("main#page")
		expect(main?.querySelector(".page-tabs h1")?.getAttribute("data-i18n"), page).toBe("cards.title")
		const links = [...(main?.querySelectorAll(".page-tabs nav a") ?? [])]
		expect(links.map((a) => a.getAttribute("href"))).toEqual(["/cards", "/cards/limits"])
		expect(main?.querySelector('.page-tabs nav a[aria-current="page"]')?.getAttribute("href"), page).toBe(current)
		// The title, a divider and the tabs share one bar.
		const bar = main?.querySelector(".page-tabs")
		expect(main?.querySelector(".page-tabs h1")?.parentElement, page).toBe(bar)
		expect(main?.querySelector(".page-tabs nav")?.parentElement, page).toBe(bar)
		expect(bar?.querySelector(':scope > h1 + .page-tabs__divider[aria-hidden="true"] + nav'), page).not.toBeNull()
		// The tabs come before the island.
		expect(main?.firstElementChild?.classList.contains("page-tabs")).toBe(true)
	}
})

test("Ledger and Lists head the page with the title and the Ledger · Lists tabs, the one on show marked", async () => {
	for (const [page, current, island] of [
		["transactions.astro", "/transactions", "TransactionsPage"],
		["transactions/lists.astro", "/transactions/lists", "ListsPage"],
	] as const) {
		const doc = parseHtml(await render(page))
		const main = doc.querySelector("main#page")
		expect(main?.querySelector(".page-tabs h1")?.getAttribute("data-i18n"), page).toBe("nav.transactions")
		expect(main?.querySelector(".page-tabs nav")?.getAttribute("data-i18n-aria-label")).toBe("tx.tabs")
		const links = [...(main?.querySelectorAll(".page-tabs nav a") ?? [])]
		expect(links.map((a) => a.getAttribute("href"))).toEqual(["/transactions", "/transactions/lists"])
		expect(main?.querySelector('.page-tabs nav a[aria-current="page"]')?.getAttribute("href"), page).toBe(current)
		expect(main?.firstElementChild?.classList.contains("page-tabs")).toBe(true)
		expect(await source(page)).toContain(`<${island} client:load`)
	}
})

test("the builder and the edit page are full pages under the Lists tab's path, with no tabs", async () => {
	expect(await source("transactions/lists/new.astro")).toContain("<ListNewPage client:load />")
	expect(await source("transactions/lists/edit.astro")).toContain("<ListEditPage client:load />")
	for (const page of ["transactions/lists/new.astro", "transactions/lists/edit.astro"]) {
		expect(parseHtml(await render(page)).querySelector(".page-tabs"), page).toBeNull()
	}
})

test("Needs you, Owed and Ready to use head the page with the title and Home's tabs, the one on show marked", async () => {
	for (const [page, current, island] of [
		["index.astro", "/", "HomePage"],
		["owed.astro", "/owed", "OwedPage"],
		["ready.astro", "/ready", "ReadyPage"],
	] as const) {
		const doc = parseHtml(await render(page))
		const main = doc.querySelector("main#page")
		expect(main?.querySelector(".page-tabs h1")?.getAttribute("data-i18n"), page).toBe("nav.home")
		expect(main?.querySelector(".page-tabs nav")?.getAttribute("data-i18n-aria-label")).toBe("home.tabs")
		const links = [...(main?.querySelectorAll(".page-tabs nav a") ?? [])]
		expect(links.map((a) => a.getAttribute("href"))).toEqual(["/", "/owed", "/ready"])
		expect(main?.querySelector('.page-tabs nav a[aria-current="page"]')?.getAttribute("href"), page).toBe(current)
		expect(main?.firstElementChild?.classList.contains("page-tabs")).toBe(true)
		expect(await source(page)).toContain(`<${island} client:load`)
	}
})
