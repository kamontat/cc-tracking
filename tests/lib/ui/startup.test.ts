import { expect, test } from "vitest"

import { setLocale } from "#lib/i18n/index"
import { PAYMENTS_MIGRATION_KEY } from "#lib/storage/migrate-payments"
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
	storage.setItem(PAYMENTS_MIGRATION_KEY, "done")
	const repo = new InMemoryRepository()
	const opened = await openRepository({ storage, createRepo: () => repo })
	expect(opened).toEqual({ ok: true, repo })
	expect((await repo.listLocations()).map((r) => r.id).sort()).toEqual(["bangkok", "krabi", "phichit"])
})

test("opens the store, seeds the three owners and points every group at one", async () => {
	const storage = globalThis.localStorage
	storage.removeItem(OWNERS_SEED_KEY)
	storage.setItem(PAYMENTS_MIGRATION_KEY, "done")
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

test("a failed payment conversion stops the page, and a reload retries", async () => {
	setLocale("en")
	const storage = globalThis.localStorage
	storage.removeItem(PAYMENTS_MIGRATION_KEY)
	const repo = new InMemoryRepository()
	await repo.saveCard({
		id: "A",
		name: "A",
		last4: "0000",
		location: "krabi",
		cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
		archived: false,
		limitGroupId: "g1",
	})
	await repo.savePurchase({ id: "p1", cardId: "A", date: "2026-09-10", amount: 1_00, note: "" })
	await repo.savePayment({
		cardId: "A",
		period: "2026-09",
		paidAt: "2026-10-01",
		closeDate: "2026-09-25",
		dueDate: "2026-10-15",
		parts: [{ paidAt: "2026-10-01", amount: 1_00 }],
	})
	repo.saveCardPayment = async () => {
		throw new Error("disk full")
	}
	repo.saveStatementDates = async () => {}
	const spy = console.error
	console.error = () => {}
	try {
		const opened = await openRepository({ storage, createRepo: () => repo })
		expect(opened.ok).toBe(false)
		if (opened.ok) return
		expect(opened.message()).toBe("Could not update your saved payments. Nothing was lost. Reload to try again.")
		expect(storage.getItem(PAYMENTS_MIGRATION_KEY)).toBeNull()
	} finally {
		console.error = spy
	}
})
