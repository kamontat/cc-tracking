/**
 * What the service worker does (PRD DD-181), apart from the worker's own events, which
 * `src/lib/offline/sw.ts` wires to these. Each build is a version: its files go into a cache of
 * their own when the worker installs, the other versions' caches go when it takes over, and
 * every request this site makes is served from that cache, so every page works offline once a
 * visit has installed the worker. The reader's data is in `localStorage` and needs nothing here.
 */

/** Every cache this site owns starts with this; a cache by another name is left alone. */
export const CACHE_PREFIX = "cc-offline-"

/** The parts of `CacheStorage` the worker uses, which tests fake. */
export type Caches = {
	open(name: string): Promise<{
		put(request: RequestInfo | URL, response: Response): Promise<void>
		match(request: RequestInfo | URL, options?: CacheQueryOptions): Promise<Response | undefined>
	}>
	keys(): Promise<string[]>
	delete(name: string): Promise<boolean>
}

type Fetch = (input: Request | string, init?: RequestInit) => Promise<Response>

const cacheName = (version: string) => `${CACHE_PREFIX}${version}`

/**
 * Fetches every one of the build's files past the browser's HTTP cache and stores them in the
 * version's cache. A file that does not arrive fails the install, so the version already running
 * keeps the page, and the browser tries the new one again later.
 */
export async function install(
	{ caches, fetch }: { caches: Caches; fetch: Fetch },
	version: string,
	urls: readonly string[],
): Promise<void> {
	const responses = await Promise.all(
		urls.map(async (url) => {
			const response = await fetch(url, { cache: "reload" })
			if (!response.ok) throw new Error(`Could not cache ${url}: ${response.status}`)
			return [url, response] as const
		}),
	)
	const cache = await caches.open(cacheName(version))
	await Promise.all(responses.map(([url, response]) => cache.put(url, response)))
}

/** Drops the caches of every other version, once this one runs the pages. */
export async function activate({ caches }: { caches: Caches }, version: string): Promise<void> {
	const keep = cacheName(version)
	const names = await caches.keys()
	await Promise.all(
		names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== keep).map((name) => caches.delete(name)),
	)
}

/** Whether the worker answers a request: this site's reads. Another site's (Google Tag Manager) goes to the network. */
export function handles(request: Request, origin: string): boolean {
	return request.method === "GET" && new URL(request.url).origin === origin
}

/**
 * The version's copy of what is asked for, else the network. A page's query (`/card?id=`) is
 * read by its script, so the one cached page answers every query.
 */
export async function respond(
	{ caches, fetch }: { caches: Caches; fetch: Fetch },
	version: string,
	request: Request,
): Promise<Response> {
	const cache = await caches.open(cacheName(version))
	return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request)
}
