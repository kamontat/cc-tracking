import { afterEach, describe, expect, test, vi } from "vitest"

import { forceRefresh, watchForUpdates } from "#lib/offline/register"

/** A service worker in a given state, which can move on and announce it as the browser's does. */
class FakeWorker extends EventTarget {
	readonly postMessage = vi.fn()
	constructor(public state: ServiceWorkerState) {
		super()
	}
	moveTo(state: ServiceWorkerState) {
		this.state = state
		this.dispatchEvent(new Event("statechange"))
	}
}

class FakeRegistration extends EventTarget {
	installing: FakeWorker | null = null
	waiting: FakeWorker | null = null
	readonly update = vi.fn(async () => {})
	found(worker: FakeWorker) {
		this.installing = worker
		this.dispatchEvent(new Event("updatefound"))
	}
}

class FakeContainer extends EventTarget {
	controller: FakeWorker | null
	readonly registration = new FakeRegistration()
	readonly register = vi.fn(async () => this.registration)
	constructor(controlled: boolean) {
		super()
		this.controller = controlled ? new FakeWorker("activated") : null
	}
}

const controller = new AbortController()
afterEach(() => {
	controller.abort()
})

const watch = async (container: FakeContainer) => {
	const offers: (() => void)[] = []
	const reload = vi.fn()
	const events = new EventTarget()
	await watchForUpdates({
		container: container as unknown as ServiceWorkerContainer,
		onUpdate: (apply) => offers.push(apply),
		reload,
		events,
		signal: controller.signal,
	})
	return { offers, reload, events }
}

test("registers /sw.js", async () => {
	const container = new FakeContainer(false)
	await watch(container)
	expect(container.register).toHaveBeenCalledWith("/sw.js")
})

test("does nothing in a browser without service workers", async () => {
	const onUpdate = vi.fn()
	await watchForUpdates({ container: undefined, onUpdate, reload: vi.fn(), events: new EventTarget() })
	expect(onUpdate).not.toHaveBeenCalled()
})

describe("a new version", () => {
	test("is offered once it has downloaded, while an older one runs the page", async () => {
		const container = new FakeContainer(true)
		const { offers } = await watch(container)
		const next = new FakeWorker("installing")
		container.registration.found(next)
		expect(offers).toHaveLength(0)
		next.moveTo("installed")
		expect(offers).toHaveLength(1)
	})

	test("is not offered on the first visit, when nothing ran the page before", async () => {
		const container = new FakeContainer(false)
		const { offers } = await watch(container)
		const first = new FakeWorker("installing")
		container.registration.found(first)
		first.moveTo("installed")
		expect(offers).toHaveLength(0)
	})

	test("already waiting from an earlier visit is offered straight away", async () => {
		const container = new FakeContainer(true)
		container.registration.waiting = new FakeWorker("installed")
		const { offers } = await watch(container)
		expect(offers).toHaveLength(1)
	})

	test("taking over reloads the page once it runs it", async () => {
		const container = new FakeContainer(true)
		const { offers, reload } = await watch(container)
		const next = new FakeWorker("installing")
		container.registration.found(next)
		next.moveTo("installed")
		offers[0]?.()
		expect(next.postMessage).toHaveBeenCalledWith({ type: "skip-waiting" })
		expect(reload).not.toHaveBeenCalled()
		container.dispatchEvent(new Event("controllerchange"))
		expect(reload).toHaveBeenCalledTimes(1)
	})

	test("a takeover nobody asked for, the first visit's, does not reload", async () => {
		const container = new FakeContainer(false)
		const { reload } = await watch(container)
		container.dispatchEvent(new Event("controllerchange"))
		expect(reload).not.toHaveBeenCalled()
	})
})

test("looks for a new version on each page the reader opens", async () => {
	const container = new FakeContainer(true)
	const { events } = await watch(container)
	events.dispatchEvent(new Event("astro:page-load"))
	expect(container.registration.update).toHaveBeenCalledTimes(1)
})

describe("force refresh", () => {
	test("drops every worker and cached file, then reloads", async () => {
		const done: string[] = []
		const registrations = ["a", "b"].map((name) => ({
			unregister: vi.fn(async () => {
				done.push(`unregister ${name}`)
				return true
			}),
		}))
		const container = { getRegistrations: vi.fn(async () => registrations) }
		const caches = {
			keys: vi.fn(async () => ["v1", "v2"]),
			delete: vi.fn(async (key: string) => {
				done.push(`delete ${key}`)
				return true
			}),
		}
		const reload = vi.fn(() => done.push("reload"))
		await forceRefresh({ container, caches, reload })
		expect(done.slice(0, -1).sort()).toEqual(["delete v1", "delete v2", "unregister a", "unregister b"])
		expect(done.at(-1)).toBe("reload")
	})

	test("reloads in a browser with no service workers or caches", async () => {
		const reload = vi.fn()
		await forceRefresh({ container: undefined, caches: undefined, reload })
		expect(reload).toHaveBeenCalledTimes(1)
	})

	test("still reloads when clearing fails", async () => {
		const reload = vi.fn()
		const container = { getRegistrations: vi.fn(async () => Promise.reject(new Error("blocked"))) }
		const caches = { keys: vi.fn(async () => Promise.reject(new Error("blocked"))), delete: vi.fn() }
		await forceRefresh({ container, caches, reload })
		expect(reload).toHaveBeenCalledTimes(1)
	})
})
