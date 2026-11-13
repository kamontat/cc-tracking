/**
 * The page's side of offline use (PRD DD-181): registers the service worker that
 * `scripts/service-worker.ts` writes, and says when a new version of the site has downloaded.
 * The worker keeps serving the version the page started on until the reader asks for the new one
 * from the update bar; then it takes over and the page reloads into it, files and all.
 */

export type WatchOptions = {
	/** `navigator.serviceWorker`; `undefined` in a browser without service workers. */
	container: ServiceWorkerContainer | undefined
	/** Called once a new version waits, with the function that switches to it. */
	onUpdate: (apply: () => void) => void
	/** Reloads the page into the new version once it has taken over. */
	reload: () => void
	/** Where the ClientRouter announces each page (`document`): every page opened looks for a new version. */
	events: EventTarget
	signal?: AbortSignal
}

export async function watchForUpdates({ container, onUpdate, reload, events, signal }: WatchOptions): Promise<void> {
	if (!container) return
	const registration = await container.register("/sw.js")
	let asked = false
	const listening: AddEventListenerOptions = signal ? { signal } : {}

	const offer = (worker: ServiceWorker) =>
		onUpdate(() => {
			asked = true
			worker.postMessage({ type: "skip-waiting" })
		})

	// Only a takeover the reader asked for reloads: the first visit's worker takes over unasked.
	container.addEventListener(
		"controllerchange",
		() => {
			if (asked) reload()
		},
		listening,
	)

	// With no worker running the page this is the first visit: the files are only being cached.
	if (registration.waiting && container.controller) offer(registration.waiting)
	registration.addEventListener(
		"updatefound",
		() => {
			const worker = registration.installing
			worker?.addEventListener(
				"statechange",
				() => {
					if (worker.state === "installed" && container.controller) offer(worker)
				},
				listening,
			)
		},
		listening,
	)

	// The browser checks for a new worker on a full load only, and the ClientRouter swaps pages
	// without one, so each page the reader opens asks too.
	events.addEventListener(
		"astro:page-load",
		() => {
			registration.update().catch(() => {
				// Offline, or the server is away: the next page asks again.
			})
		},
		listening,
	)
}

export type RefreshOptions = {
	/** `navigator.serviceWorker`; `undefined` in a browser without service workers. */
	container: { getRegistrations(): Promise<readonly Pick<ServiceWorkerRegistration, "unregister">[]> } | undefined
	/** `window.caches`; `undefined` where the Cache API is missing (an insecure origin). */
	caches: Pick<CacheStorage, "keys" | "delete"> | undefined
	/** Loads the page again, now from the server. */
	reload: () => void
}

/**
 * Settings' *Force refresh*: drops every service worker and every cached file, then reloads, so
 * the page comes from the server, newest version and all, and the next visit caches it afresh.
 * Stored data (`localStorage`) is not touched. A step that fails is skipped: the reload still runs.
 */
export async function forceRefresh({ container, caches, reload }: RefreshOptions): Promise<void> {
	const unregister = async () => {
		const registrations = (await container?.getRegistrations()) ?? []
		await Promise.all(registrations.map((registration) => registration.unregister()))
	}
	const clear = async () => {
		const keys = (await caches?.keys()) ?? []
		await Promise.all(keys.map((key) => caches?.delete(key)))
	}
	await Promise.allSettled([unregister(), clear()])
	reload()
}
