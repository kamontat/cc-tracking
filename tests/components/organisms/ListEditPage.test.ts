import { afterEach, expect, test } from "vitest"

import ListEditPage from "#components/organisms/ListEditPage.svelte"
import { cleanup, draft, elsewhereLink, flatText, saved, sent, setupPage, titleOf } from "./list-support"

/**
 * `/transactions/lists/edit?list=<id>` (RD-26): the builder on a draft, the reply on a waiting
 * list; a saved list or an unknown id says so and links to its panel or the Lists tab.
 */
afterEach(cleanup)

const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector)

test("a draft opens in the builder", async () => {
	await setupPage(ListEditPage, { search: "?list=d1", before: (r) => r.savePurchaseList(draft("d1", ["A"])) })
	expect(titleOf($("h1"))).toBe("Draft list")
	expect([...document.querySelectorAll(".lines > .line[data-card]")].map((el) => el.getAttribute("data-card"))).toEqual(
		["A"],
	)
	expect($('[data-action="back"]')?.getAttribute("href")).toBe("/transactions/lists")
})

test("a waiting list opens the reply", async () => {
	await setupPage(ListEditPage, { search: "?list=w1", before: (r) => r.savePurchaseList(sent("w1", ["A", "B"])) })
	expect(titleOf($("h1"))).toBe("Spender's reply")
	expect(document.querySelectorAll(".line[data-card]")).toHaveLength(2)
})

test("a saved list has no edit page: it says so and links to its panel", async () => {
	await setupPage(ListEditPage, { search: "?list=s1", before: (r) => r.savePurchaseList(saved("s1", ["A"])) })
	expect(document.body.textContent).toContain("This list is already saved.")
	expect(elsewhereLink(document)).toBe("/transactions/lists?list=s1")
	expect($(".line[data-card]")).toBeNull()
})

test("an unknown or missing list says so and links to the Lists tab", async () => {
	for (const search of ["?list=gone", "", "?id=d1"]) {
		await setupPage(ListEditPage, { search, before: (r) => r.savePurchaseList(draft("d1", ["A"])) })
		expect(document.body.textContent).toContain("This list no longer exists.")
		expect(flatText($('a[href="/transactions/lists"]:not([data-action])'))).toBe("Go to Lists")
	}
})

test("a failed store says so", async () => {
	await setupPage(ListEditPage, {
		search: "?list=d1",
		props: { open: async () => ({ ok: false as const, message: () => "The store would not open." }) },
	})
	expect(flatText($(".error-banner p"))).toBe("The store would not open.")
})
