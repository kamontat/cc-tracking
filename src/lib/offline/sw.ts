/**
 * The service worker's entry (PRD DD-181), which `scripts/service-worker.ts` bundles into
 * `dist/sw.js` after each build, defining the build's version and files. Only the browser runs
 * it; its work is in `#lib/offline/worker`.
 */
import { activate, handles, install, respond } from "#lib/offline/worker"

/** A hash of the build's files: a new build with any change is a new version. */
declare const __CC_VERSION__: string
/** Every address the build serves, each page at its address without `.html`. */
declare const __CC_URLS__: string[]

/** The worker events and scope this uses; the DOM types have no worker scope. */
type ExtendableEvent = Event & { waitUntil(promise: Promise<unknown>): void }
type FetchEvent = ExtendableEvent & { request: Request; respondWith(response: Promise<Response>): void }
type MessageEvent = ExtendableEvent & { data: unknown }
type WorkerScope = {
	location: Location
	caches: CacheStorage
	clients: { claim(): Promise<void> }
	skipWaiting(): Promise<void>
	addEventListener(type: "install" | "activate", listener: (event: ExtendableEvent) => void): void
	addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void
	addEventListener(type: "message", listener: (event: MessageEvent) => void): void
}

const scope = globalThis as unknown as WorkerScope
const fetch = (input: Request | string, init?: RequestInit) => globalThis.fetch(input, init)

scope.addEventListener("install", (event) => {
	event.waitUntil(install({ caches: scope.caches, fetch }, __CC_VERSION__, __CC_URLS__))
})

// A new version waits until the reader asks for it from the update bar (`#lib/offline/register`),
// so a page is never served by two versions' files. The first one has nothing to wait for.
scope.addEventListener("message", (event) => {
	const data = event.data as { type?: unknown } | null
	if (data?.type === "skip-waiting") event.waitUntil(scope.skipWaiting())
})

scope.addEventListener("activate", (event) => {
	event.waitUntil(activate({ caches: scope.caches }, __CC_VERSION__).then(() => scope.clients.claim()))
})

scope.addEventListener("fetch", (event) => {
	if (!handles(event.request, scope.location.origin)) return
	event.respondWith(respond({ caches: scope.caches, fetch }, __CC_VERSION__, event.request))
})
