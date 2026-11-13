import type { AddressBar } from "#lib/ui/address-bar"

/**
 * A browser history in memory: entries with the address each holds, Back and Forward (and
 * `go`) moving between them and telling the page, as `popstate` does.
 */
export function fakeHistory(start = "/cards") {
	const entries = [start]
	let at = 0
	const calls: string[] = []
	// Every listener hears each pop, as `popstate` reaches each: a page's and its panel's.
	const listeners = new Set<() => void>()
	const pop = () => {
		for (const listener of [...listeners]) listener()
	}
	const move = (delta: number) => {
		const next = Math.min(entries.length - 1, Math.max(0, at + delta))
		if (next === at) return
		at = next
		pop()
	}
	const bar: AddressBar = {
		search: () => {
			const entry = entries[at] ?? ""
			const q = entry.indexOf("?")
			return q === -1 ? "" : entry.slice(q)
		},
		push: (url) => {
			calls.push(`push ${url}`)
			entries.splice(at + 1, entries.length, url)
			at++
		},
		replace: (url) => {
			calls.push(`replace ${url}`)
			entries[at] = url
		},
		onPop: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		length: () => entries.length,
		back: () => {
			calls.push("back")
			move(-1)
		},
		go: (delta) => {
			calls.push(`go ${delta}`)
			move(delta)
		},
	}
	return {
		bar,
		calls,
		/** The browser's own Back and Forward, which the page did not ask for. */
		userBack: () => move(-1),
		userForward: () => move(1),
		now: () => entries[at],
		at: () => at,
		size: () => entries.length,
	}
}
