import { afterEach, expect, test } from "vitest"

import { browserBar } from "#lib/ui/address-bar"

afterEach(() => {
	// Every bar's stamp waits for the router's next departure: let it go, as a navigation would.
	document.dispatchEvent(new Event("astro:before-preparation"))
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
	history.replaceState({ index: 3 }, "", "/transactions/lists/new?cards=A")
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
		bar.push("/transactions/lists/new?cards=A", { ownPage: true })
		expect(history.state).toBeNull()
		// Back onto the page's own entry, which the push left with no state.
		history.replaceState(null, "", "/transactions/lists/new?cards=A")
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
	history.replaceState({ index: 2 }, "", "/owed")
	const bar = browserBar()
	bar.push("/owed?card=A")
	history.replaceState(null, "", "/owed")
	let pops = 0
	const remove = bar.onPop(() => {
		pops++
	})
	dispatchEvent(new PopStateEvent("popstate", { state: null }))
	remove()
	expect(pops).toBe(1)
	expect(history.state).toBeNull()
})

test("go moves several entries at once", () => {
	const bar = browserBar()
	const calls: number[] = []
	const go = history.go
	history.go = (delta?: number) => {
		calls.push(delta ?? 0)
	}
	try {
		bar.go?.(-2)
	} finally {
		history.go = go
	}
	expect(calls).toEqual([-2])
})

test("a pushed entry the router leaves from gets the router's state, so Back to it is the router's", () => {
	history.replaceState({ index: 4, scrollX: 0, scrollY: 0 }, "", "/cards")
	const bar = browserBar()
	bar.push("/cards?card=5", { ownPage: true })
	bar.push("/cards?card=5")
	expect(history.state).toBeNull()
	document.dispatchEvent(new Event("astro:before-preparation"))
	expect(history.state).toMatchObject({ index: 4 })
	expect(location.search).toBe("?card=5")
})

test("an entry that has the router's state is left as it is", () => {
	history.replaceState({ index: 1, own: true }, "", "/cards")
	const bar = browserBar()
	bar.push("/cards?card=5")
	history.replaceState({ index: 7 }, "", "/cards?card=5")
	document.dispatchEvent(new Event("astro:before-preparation"))
	expect(history.state).toEqual({ index: 7 })
	// Stamped once only: a later departure is the next page's business.
	history.replaceState(null, "", "/cards?card=5")
	document.dispatchEvent(new Event("astro:before-preparation"))
	expect(history.state).toBeNull()
})
