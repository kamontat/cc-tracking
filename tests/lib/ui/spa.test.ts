import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { leavePage, onPage, pageSignal, resetPages } from "#lib/ui/spa"

/**
 * With Astro's ClientRouter (PRD DD-174) a page's script runs once, the first time the page is
 * visited; later visits only fire `astro:page-load`. `onPage` starts the page's route on every
 * visit to it, once, and `pageSignal` lets what the page set up go when the reader leaves.
 */
const show = (route: string) => {
	document.body.innerHTML = `<main id="page" data-route="${route}"></main>`
}
const pageLoad = () => document.dispatchEvent(new Event("astro:page-load"))
const beforeSwap = () => document.dispatchEvent(new Event("astro:before-swap"))

beforeEach(() => resetPages())
afterEach(() => resetPages())

describe("onPage", () => {
	test("starts the route when the page already shows it", () => {
		show("cards")
		const start = vi.fn()
		onPage("cards", start)
		expect(start).toHaveBeenCalledTimes(1)
	})

	test("leaves another page's route alone", () => {
		show("cards")
		const start = vi.fn()
		onPage("settings", start)
		pageLoad()
		expect(start).not.toHaveBeenCalled()
	})

	test("starts once per visit, however often the page-load event fires", () => {
		show("cards")
		const start = vi.fn()
		onPage("cards", start)
		pageLoad()
		pageLoad()
		expect(start).toHaveBeenCalledTimes(1)
	})

	test("starts again on a later visit, after the reader went elsewhere", () => {
		show("cards")
		const cards = vi.fn()
		const settings = vi.fn()
		onPage("cards", cards)
		onPage("settings", settings)
		beforeSwap()
		show("settings")
		pageLoad()
		beforeSwap()
		show("cards")
		pageLoad()
		expect(cards).toHaveBeenCalledTimes(2)
		expect(settings).toHaveBeenCalledTimes(1)
	})

	test("starts a revisit of the same page again", () => {
		show("cards")
		const start = vi.fn()
		onPage("cards", start)
		beforeSwap()
		show("cards")
		pageLoad()
		expect(start).toHaveBeenCalledTimes(2)
	})
})

describe("pageSignal", () => {
	test("is aborted when the reader leaves the page, and a fresh one follows", () => {
		const first = pageSignal()
		expect(first.aborted).toBe(false)
		beforeSwap()
		expect(first.aborted).toBe(true)
		expect(pageSignal().aborted).toBe(false)
	})

	test("leavePage aborts it directly", () => {
		const signal = pageSignal()
		leavePage()
		expect(signal.aborted).toBe(true)
	})
})
