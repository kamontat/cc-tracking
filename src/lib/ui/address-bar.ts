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
}

/** The browser's own address bar; at build time, when there is none, an empty query. */
export const browserBar = (): AddressBar => {
	// The router's state for the entry an own-page push went over, and that entry's address.
	let held: { state: unknown; href: string } | null = null
	return {
		search: () => (typeof location === "undefined" ? "" : location.search),
		push: (url, { ownPage = false } = {}) => {
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
	}
}
