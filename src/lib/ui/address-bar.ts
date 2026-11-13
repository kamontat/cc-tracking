/**
 * The address bar as a page with a sheet uses it (PRD DD-102): a tap that opens a sheet pushes
 * an entry, so Back closes it; closing rewrites the entry. A seam, so a test can record what the
 * page did to the address and play Back and Forward.
 */
export type AddressBar = {
	/** The address's query as it stands now. */
	search: () => string
	/**
	 * Adds an entry (`history.pushState`): opening a sheet, so Back closes it. With `ownPage` the
	 * page keeps what it holds in memory when Back returns: the client router's state is taken off
	 * the entry underneath until then, so the router lets that Back be and does not swap in a fresh
	 * copy of the page (DD-195). `onPop` with `ownPage` puts it back.
	 *
	 * The pushed entry carries no state, so the router leaves Back and Forward between such entries
	 * to the page. A link followed from one would leave it stateless behind the next page, and Back
	 * from there would change the address without swapping the page back in; so just before the
	 * router next leaves (`astro:before-preparation`), an entry still without state is given the
	 * router's own from the page's entry, and Back to it loads the page on that address (DD-196).
	 */
	push: (url: string, options?: { ownPage?: boolean }) => void
	/** Rewrites this entry (`history.replaceState`), keeping the router's state. */
	replace: (url: string) => void
	/**
	 * Runs `listener` when Back or Forward moves between this page's entries; returns its remover.
	 * With `ownPage`, the router's state set aside by an own-page `push` is back on its entry
	 * before `listener` runs.
	 */
	onPop: (listener: () => void, options?: { ownPage?: boolean }) => () => void
	/** How many entries the session holds: a back control steps back only when there is one. */
	length: () => number
	/** One entry back. */
	back: () => void
	/**
	 * Moves `delta` entries (`history.go`), one pop for the whole move: the detail panel steps
	 * back over every entry it pushed at once (`RecordPanel.close`). Left out of a test's bar,
	 * the panel steps back one entry at a time.
	 */
	go?: (delta: number) => void
}

/** The browser's own address bar; at build time, when there is none, an empty query. */
export const browserBar = (): AddressBar => {
	// The router's state for the entry an own-page push went over, and that entry's address.
	let held: { state: unknown; href: string } | null = null
	// Whether a stamp waits for the router's next departure.
	let armed = false

	/** Gives the entry the router leaves from `state` when it has none (see `push`). */
	const arm = (state: unknown) => {
		if (armed || state === null || typeof state !== "object") return
		armed = true
		document.addEventListener(
			"astro:before-preparation",
			() => {
				armed = false
				if (history.state === null) history.replaceState({ ...state, scrollX, scrollY }, "", location.href)
			},
			{ once: true },
		)
	}

	return {
		search: () => (typeof location === "undefined" ? "" : location.search),
		push: (url, { ownPage = false } = {}) => {
			arm(held?.state ?? history.state)
			if (ownPage && held === null && history.state !== null) {
				held = { state: history.state, href: location.href }
				history.replaceState(null, "", location.href)
			}
			history.pushState(null, "", url)
		},
		replace: (url) => history.replaceState(history.state, "", url),
		onPop: (listener, { ownPage = false } = {}) => {
			const own = () => {
				if (ownPage && held && location.href === held.href) {
					history.replaceState(held.state, "", location.href)
					held = null
				}
				listener()
			}
			addEventListener("popstate", own)
			return () => removeEventListener("popstate", own)
		},
		length: () => history.length,
		back: () => history.back(),
		go: (delta) => history.go(delta),
	}
}
