import { afterEach, expect, test } from "vitest"

import { browserBar } from "#lib/ui/address-bar"

afterEach(() => {
	history.replaceState(null, "", "/")
})

test("reads, pushes and rewrites the browser's address, keeping the router's state on a rewrite", () => {
	const bar = browserBar()
	history.replaceState({ index: 3 }, "", "/cards?q=a")
	expect(bar.search()).toBe("?q=a")

	bar.replace("/cards?q=b")
	expect(location.search).toBe("?q=b")
	expect(history.state).toEqual({ index: 3 })

	const before = bar.length()
	bar.push("/cards?group=g1")
	expect(location.search).toBe("?group=g1")
	expect(bar.length()).toBe(before + 1)
})

test("a pop listener runs on popstate until it is removed", () => {
	const bar = browserBar()
	let pops = 0
	const remove = bar.onPop(() => {
		pops++
	})
	dispatchEvent(new PopStateEvent("popstate"))
	remove()
	dispatchEvent(new PopStateEvent("popstate"))
	expect(pops).toBe(1)
})
