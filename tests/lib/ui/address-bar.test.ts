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

test("an own-page entry hides the page's own entry from the router until Back returns to it", () => {
	history.replaceState({ index: 3 }, "", "/list/new?card=A")
	const bar = browserBar()
	// The client router ignores a pop onto an entry with no state, as Astro's does.
	const routed: unknown[] = []
	const router = (event: PopStateEvent) => {
		if (event.state !== null) routed.push(event.state)
	}
	addEventListener("popstate", router)
	let pops = 0
	const remove = bar.onPop(
		() => {
			pops++
			// The page's listener runs after the router's state is back, so a rewrite keeps it.
			expect(history.state).toEqual({ index: 3 })
		},
		{ ownPage: true },
	)
	try {
		bar.push("/list/new?card=A&add=1", { ownPage: true })
		expect(history.state).toBeNull()
		// Back onto the page's own entry, which the push left with no state.
		history.replaceState(null, "", "/list/new?card=A")
		dispatchEvent(new PopStateEvent("popstate", { state: null }))
		expect(routed).toEqual([])
		expect(pops).toBe(1)
		expect(history.state).toEqual({ index: 3 })
	} finally {
		remove()
		removeEventListener("popstate", router)
	}
})

test("a plain push leaves the page's own entry to the router", () => {
	history.replaceState({ index: 2 }, "", "/pay")
	const bar = browserBar()
	bar.push("/pay?card=A")
	history.replaceState(null, "", "/pay")
	let pops = 0
	const remove = bar.onPop(() => {
		pops++
	})
	dispatchEvent(new PopStateEvent("popstate", { state: null }))
	remove()
	expect(pops).toBe(1)
	expect(history.state).toBeNull()
})
