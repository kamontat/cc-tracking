import type { Card, Purchase } from "#lib/domain/types"

import { expect, test } from "vitest"

import { InMemoryRepository } from "#lib/storage/repository"
import { loadMoneyData } from "#lib/ui/money-data"

const TODAY = "2026-10-31"

const card = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: id,
	last4: "0000",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
})

const purchase: Purchase = {
	id: "p1",
	cardId: "A",
	date: "2026-09-10",
	amount: 10_000_00,
	note: "fuel",
}

test("reads stored card payments", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card("A"))
	await repo.savePurchase(purchase)
	const before = await loadMoneyData(repo, TODAY)
	await repo.saveCardPayment({
		id: "c1",
		cardId: "A",
		date: "2026-10-01",
		amount: 4_000_00,
		status: "paid",
	})

	const data = await loadMoneyData(repo, TODAY)

	expect(data.payments.map((p) => p.id)).toEqual(["c1"])
	expect(data.ledgers.get("A")?.owed).toBe((before.ledgers.get("A")?.owed ?? 0) - 4_000_00)
})

test("lists, locations and archived cards come back", async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card("A"))
	await repo.saveCard(card("Z", { archived: true }))
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 })
	const draft = {
		id: "l1",
		date: "2026-10-30",
		status: "draft" as const,
		lines: [{ cardId: "A", amount: 1_000_00 }],
	}
	await repo.savePurchaseList(draft)
	const phichit = { id: "phichit", name: "Phichit", takesPurchases: false }
	const krabi = { id: "krabi", name: "Krabi", takesPurchases: true }
	const bangkok = { id: "bangkok", name: "Bangkok", takesPurchases: false }
	for (const record of [phichit, krabi, bangkok]) await repo.saveLocation(record)

	const data = await loadMoneyData(repo, TODAY)

	expect(data.lists).toEqual([draft])
	expect(data.locations).toEqual(expect.arrayContaining([bangkok, krabi, phichit]))
	expect(data.locations).toHaveLength(3)
	// None stored yet (before the seed ran): the starting three, as export writes them.
	expect(data.owners.map((o) => o.id)).toEqual(["KC", "NT", "RI"])
	await repo.saveOwner({ id: "pim", name: "Pim" })
	expect((await loadMoneyData(repo, TODAY)).owners).toEqual([{ id: "pim", name: "Pim" }])
	expect(data.groups.map((g) => g.id)).toEqual(["g1"])
	expect(data.cards.map((c) => c.id).sort()).toEqual(["A", "Z"])
	expect(data.ledgers.has("Z")).toBe(true)
})
