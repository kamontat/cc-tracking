import { expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { InMemoryRepository } from "#lib/storage/repository"
import { SEED_KEY } from "#lib/storage/seed-locations"
import { OWNERS_SEED_KEY } from "#lib/storage/seed-owners"
import { openRepository } from "#lib/ui/startup"

/**
 * What every page does before it reads anything: open the store and bring stored data up to
 * date. Shared by the legacy `bootstrap` and the Astro islands, so both start the same way.
 */
test("opens the store and seeds the three locations on a fresh one", async () => {
	const storage = globalThis.localStorage
	storage.removeItem(SEED_KEY)
	const repo = new InMemoryRepository()
	const opened = await openRepository({ storage, createRepo: () => repo })
	expect(opened).toEqual({ ok: true, repo })
	expect((await repo.listLocations()).map((r) => r.id).sort()).toEqual(["bangkok", "krabi", "phichit"])
})

test("opens the store, seeds the three owners and points every group at one", async () => {
	const storage = globalThis.localStorage
	storage.removeItem(OWNERS_SEED_KEY)
	const repo = new InMemoryRepository()
	await repo.saveLimitGroup({ id: "g1", name: "Pool", limit: 1_00, owner: "gone" })
	await openRepository({ storage, createRepo: () => repo })
	expect((await repo.listOwners()).map((r) => r.id)).toEqual(["KC", "NT", "RI"])
	expect((await repo.listLimitGroups())[0]?.owner).toBe("KC")
})

test("a store the browser refuses gives the reason, in the reader's language", async () => {
	setLocale("en")
	const spy = console.error
	console.error = () => {}
	try {
		const opened = await openRepository({
			createRepo: () => {
				throw new Error("SecurityError")
			},
		})
		expect(opened.ok).toBe(false)
		if (opened.ok) return
		expect(opened.message()).toContain("SecurityError")
	} finally {
		console.error = spy
	}
})
