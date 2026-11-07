/**
 * The address bar as a page with a sheet uses it (PRD DD-102): a tap that opens a sheet pushes
 * an entry, so Back closes it; closing rewrites the entry. A seam, so a test can record what the
 * page did to the address and play Back and Forward.
 */
export type AddressBar = {
	/** The address's query as it stands now. */
	search: () => string
	/** Adds an entry (`history.pushState`): opening a sheet, so Back closes it. */
	push: (url: string) => void
	/** Rewrites this entry (`history.replaceState`), keeping the router's state. */
	replace: (url: string) => void
	/** Runs `listener` when Back or Forward moves between this page's entries; returns its remover. */
	onPop: (listener: () => void) => () => void
	/** How many entries the session holds: a back control steps back only when there is one. */
	length: () => number
	/** One entry back. */
	back: () => void
}

/** The browser's own address bar; at build time, when there is none, an empty query. */
export const browserBar = (): AddressBar => ({
	search: () => (typeof location === "undefined" ? "" : location.search),
	push: (url) => history.pushState(null, "", url),
	replace: (url) => history.replaceState(history.state, "", url),
	onPop: (listener) => {
		addEventListener("popstate", listener)
		return () => removeEventListener("popstate", listener)
	},
	length: () => history.length,
	back: () => history.back(),
})
