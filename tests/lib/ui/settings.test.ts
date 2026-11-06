import type { Card } from "#lib/domain/types"

import { expect, test } from "vitest"

import { defaultLocations } from "#lib/domain/locations"
import { DEFAULT_SETTINGS } from "#lib/domain/settings"
import { InMemoryRepository } from "#lib/storage/repository"
import { parseAnyBackup } from "#lib/storage/transfer-v3"
import { backupFilename, locationsSummary, prepareBackupFile } from "#lib/ui/settings"

const sampleCard: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	comment: "",
	archived: false,
}

const seeded = async () => {
	const repo = new InMemoryRepository()
	for (const record of defaultLocations(DEFAULT_SETTINGS)) await repo.saveLocation(record)
	return repo
}

test("a backup file is named for the UTC day it was exported", () => {
	expect(backupFilename(new Date("2026-09-21T23:30:00Z"))).toBe("cc-tracking-2026-09-21.json")
})

test("prepareBackupFile produces text that parseAnyBackup accepts and that round-trips every card, purchase, and payment", async () => {
	const repo = await seeded()
	await repo.saveCard(sampleCard)
	await repo.saveCard({ ...sampleCard, id: "scb", name: "SCB Mastercard", location: "bangkok" })
	await repo.savePurchase({ id: "p1", cardId: "kbank", date: "2026-09-05", amount: 10_000, note: "fuel" })
	await repo.saveCardPayment({ id: "cp1", cardId: "kbank", date: "2026-10-01", amount: 5_000, status: "paid" })

	const { filename, text } = await prepareBackupFile(repo, new Date("2026-09-21T03:00:00Z"))
	expect(filename).toBe("cc-tracking-2026-09-21.json")

	const backup = parseAnyBackup(text)
	expect(backup.cards).toEqual(await repo.listCards())
	expect(backup.purchases).toEqual(await repo.listPurchases("kbank"))
	expect(backup.payments).toEqual(await repo.listCardPayments("kbank"))
})

test("the downloaded file is version 3 and carries lists", async () => {
	const repo = await seeded()
	await repo.saveCard(sampleCard)
	await repo.savePurchaseList({
		id: "l1",
		date: "2026-10-01",
		status: "draft",
		lines: [{ cardId: "kbank", amount: 1_000 }],
	})
	const parsed = JSON.parse((await prepareBackupFile(repo, new Date("2026-09-21T03:00:00Z"))).text)
	expect(parsed.version).toBe(3)
	expect(parsed.lists).toHaveLength(1)
	expect(parsed.locations.length).toBeGreaterThan(0)
})

test("the locations summary counts the places and names those taking purchases, A to Z", async () => {
	const records = await (await seeded()).listLocations()
	expect(locationsSummary(records)).toBe("3 places · Krabi takes purchases")
	expect(locationsSummary(records.map((record) => ({ ...record, takesPurchases: true })))).toBe(
		"3 places · Bangkok, Krabi, Phichit take purchases",
	)
	expect(locationsSummary([{ id: "x", name: "X", takesPurchases: false }])).toBe("1 place · none take purchases")
})
