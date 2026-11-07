import { describe, expect, test, vi } from "vitest"

import { activate, CACHE_PREFIX, handles, install, respond } from "#lib/offline/worker"

/** An in-memory `CacheStorage`, matching by path and, with `ignoreSearch`, without the query. */
function fakeCaches() {
	const stores = new Map<string, Map<string, Response>>()
	const keyOf = (request: RequestInfo | URL, ignoreSearch = false) => {
		const url = new URL(request instanceof Request ? request.url : String(request), "https://cc.test")
		return ignoreSearch ? url.pathname : url.pathname + url.search
	}
	const open = async (name: string) => {
		const store = stores.get(name) ?? new Map<string, Response>()
		stores.set(name, store)
		return {
			async put(request: RequestInfo | URL, response: Response) {
				store.set(keyOf(request), response)
			},
			async match(request: RequestInfo | URL, options?: CacheQueryOptions) {
				const wanted = keyOf(request, options?.ignoreSearch)
				for (const [key, response] of store) {
					if ((options?.ignoreSearch ? key.split("?")[0] : key) === wanted) return response.clone()
				}
				return undefined
			},
		}
	}
	return {
		stores,
		open,
		keys: async () => [...stores.keys()],
		delete: async (name: string) => stores.delete(name),
	}
}

const ok = (body: string) => new Response(body, { status: 200 })

describe("install", () => {
	test("fetches every file afresh into the version's cache", async () => {
		const caches = fakeCaches()
		const fetch = vi.fn(async (url: Request | string, _init?: RequestInit) => ok(String(url)))
		await install({ caches, fetch }, "v1", ["/", "/card"])
		expect(fetch.mock.calls).toEqual([
			["/", { cache: "reload" }],
			["/card", { cache: "reload" }],
		])
		const cache = await caches.open(`${CACHE_PREFIX}v1`)
		expect(await (await cache.match("/card"))?.text()).toBe("/card")
	})

	test("fails, keeping the old version, when a file does not arrive", async () => {
		const caches = fakeCaches()
		const fetch = async (url: Request | string) => (url === "/card" ? new Response("", { status: 404 }) : ok("home"))
		await expect(install({ caches, fetch }, "v2", ["/", "/card"])).rejects.toThrow("/card")
		expect(await caches.keys()).toEqual([])
	})
})

test("activate drops every other version's cache and leaves caches it does not own", async () => {
	const caches = fakeCaches()
	await caches.open(`${CACHE_PREFIX}v1`)
	await caches.open(`${CACHE_PREFIX}v2`)
	await caches.open("someone-else")
	await activate({ caches }, "v2")
	expect(await caches.keys()).toEqual([`${CACHE_PREFIX}v2`, "someone-else"])
})

describe("handles", () => {
	test("this site's GET requests", () => {
		expect(handles(new Request("https://cc.test/card?id=1"), "https://cc.test")).toBe(true)
	})

	test("not another site's, such as Google Tag Manager", () => {
		expect(handles(new Request("https://www.googletagmanager.com/gtm.js"), "https://cc.test")).toBe(false)
	})

	test("not a request that sends something", () => {
		expect(handles(new Request("https://cc.test/", { method: "POST" }), "https://cc.test")).toBe(false)
	})
})

describe("respond", () => {
	test("serves a page from the cache whatever its query", async () => {
		const caches = fakeCaches()
		await (await caches.open(`${CACHE_PREFIX}v1`)).put("/card", ok("card page"))
		const fetch = vi.fn()
		const response = await respond({ caches, fetch }, "v1", new Request("https://cc.test/card?id=abc"))
		expect(await response.text()).toBe("card page")
		expect(fetch).not.toHaveBeenCalled()
	})

	test("goes to the network for what the cache does not hold", async () => {
		const caches = fakeCaches()
		await caches.open(`${CACHE_PREFIX}v1`)
		const fetch = vi.fn(async () => ok("from the network"))
		const request = new Request("https://cc.test/backup")
		const response = await respond({ caches, fetch }, "v1", request)
		expect(await response.text()).toBe("from the network")
		expect(fetch).toHaveBeenCalledWith(request)
	})
})
