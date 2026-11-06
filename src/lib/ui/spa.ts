/**
 * Starting and leaving pages under Astro's ClientRouter (PRD DD-174). A navigation fetches the
 * next page and swaps it in without a reload, so a page's bundled script runs only the first
 * time the page is visited; later visits only fire `astro:page-load`. A page registers its
 * route with `onPage`, and the route starts on every visit, once. What a route sets up beyond
 * its own DOM (a language listener, a `popstate` handler) passes `pageSignal()`, which aborts as
 * the reader leaves (`astro:before-swap`), so nothing piles up across navigations.
 */

/** The route each page's `<main id="page" data-route>` names. */
const ROUTE_SELECTOR = "#page[data-route]"

const routes = new Map<string, () => void>()
let started = false
let controller = new AbortController()

const currentRoute = () => document.querySelector<HTMLElement>(ROUTE_SELECTOR)?.dataset["route"]

/** Starts the shown page's route, once per visit. */
function run(): void {
	if (started) return
	const start = routes.get(currentRoute() ?? "")
	if (!start) return
	started = true
	start()
}

/** Ends the current visit: what the page set up with `pageSignal()` goes, and the next page may start. */
export function leavePage(): void {
	controller.abort()
	controller = new AbortController()
	started = false
}

/** The current visit's signal; aborted when the reader leaves the page. */
export function pageSignal(): AbortSignal {
	return controller.signal
}

/**
 * Registers `start` as the route of every page whose `<main>` says `data-route="<route>"`, and
 * starts it now if this page is one. The first visit runs the page's script after
 * `astro:page-load` may already have fired, hence the immediate check.
 */
export function onPage(route: string, start: () => void): void {
	routes.set(route, start)
	if (document.readyState !== "loading") run()
}

const onLoad = () => run()
const onLeave = () => leavePage()

function listen(): void {
	document.addEventListener("astro:page-load", onLoad)
	document.addEventListener("astro:before-swap", onLeave)
}

/** Tests only: forget every route and visit, and listen afresh. */
export function resetPages(): void {
	document.removeEventListener("astro:page-load", onLoad)
	document.removeEventListener("astro:before-swap", onLeave)
	routes.clear()
	leavePage()
	listen()
}

listen()
