import type { Card, CardPayment, ListStatus, PurchaseList } from "#lib/domain/types"

import { expect, test } from "vitest"

import { InMemoryRepository } from "#lib/storage/repository"
import { loadMoneyData } from "#lib/ui/money-data"
import {
	confirmWaitingList,
	deleteDraftList,
	deletePlannedPayment,
	markPlanPaid,
	mergeSameDayLists,
} from "#lib/ui/row-actions"

const TODAY = "2026-10-31"
const card: Card = {
	id: "A",
	name: "A",
	last4: "0000",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
}
const planned: CardPayment = {
	id: "c1",
	cardId: "A",
	date: "2026-10-01",
	amount: 4_000_00,
	status: "planned",
}
const list = (status: ListStatus): PurchaseList => ({
	id: "l1",
	date: "2026-10-30",
	status,
	lines: [{ cardId: "A", amount: 500_00 }],
	...(status === "draft" ? {} : { sentAt: "2026-10-30T01:00:00.000Z" }),
})

const setup = async () => {
	const repo = new InMemoryRepository()
	await repo.saveCard(card)
	return repo
}

test("markPlanPaid saves the payment as paid", async () => {
	const repo = await setup()
	await repo.saveCardPayment(planned)
	const data = await loadMoneyData(repo, TODAY)
	await markPlanPaid(repo, data, planned, TODAY)
	const [stored] = await repo.listCardPayments("A")
	expect(stored?.status).toBe("paid")
})

test("deletePlannedPayment removes the payment", async () => {
	const repo = await setup()
	await repo.saveCardPayment(planned)
	await deletePlannedPayment(repo, planned)
	expect(await repo.listCardPayments("A")).toEqual([])
})

test("confirmWaitingList saves the list and makes every line", async () => {
	const repo = await setup()
	await repo.savePurchaseList(list("sent"))
	await confirmWaitingList(repo, "l1", new Date("2026-11-01T00:00:00Z"))
	const [stored] = await repo.listPurchaseLists()
	expect(stored?.status).toBe("saved")
	expect((await repo.listPurchases("A")).length).toBe(1)
})

test("deleteDraftList deletes a draft in one step", async () => {
	const repo = await setup()
	await repo.savePurchaseList(list("draft"))
	await deleteDraftList(repo, "l1")
	expect(await repo.listPurchaseLists()).toEqual([])
})

test("deleteDraftList refuses a list no longer a draft", async () => {
	const repo = await setup()
	await repo.savePurchaseList(list("sent"))
	await expect(deleteDraftList(repo, "l1")).rejects.toThrow()
	expect((await repo.listPurchaseLists()).length).toBe(1)
})

test("deleteDraftList refuses a missing list", async () => {
	const repo = await setup()
	await expect(deleteDraftList(repo, "nope")).rejects.toThrow()
})

test("mergeSameDayLists merges the other same-day lists of its status into it", async () => {
	const repo = await setup()
	await repo.savePurchaseList(list("draft"))
	await repo.savePurchaseList({ ...list("draft"), id: "l2", lines: [{ cardId: "A", amount: 200_00 }] })
	await repo.savePurchaseList({ ...list("sent"), id: "l3" })
	await mergeSameDayLists(repo, "l1")
	const stored = await repo.listPurchaseLists()
	expect(stored.map((l) => l.id).sort()).toEqual(["l1", "l3"])
	expect(stored.find((l) => l.id === "l1")?.lines).toEqual([
		{ cardId: "A", amount: 500_00 },
		{ cardId: "A", amount: 200_00 },
	])
})

test("mergeSameDayLists refuses when nothing shares the list's day and status", async () => {
	const repo = await setup()
	await repo.savePurchaseList(list("draft"))
	await repo.savePurchaseList({ ...list("sent"), id: "l3" })
	await expect(mergeSameDayLists(repo, "l1")).rejects.toThrow()
	expect((await repo.listPurchaseLists()).length).toBe(2)
})

test("mergeSameDayLists refuses a saved list", async () => {
	const repo = await setup()
	await repo.savePurchaseList(list("saved"))
	await repo.savePurchaseList({ ...list("saved"), id: "l2" })
	await expect(mergeSameDayLists(repo, "l1")).rejects.toThrow()
})
