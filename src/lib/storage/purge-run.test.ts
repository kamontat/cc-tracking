import { describe, expect, test } from "vitest";
import { cardLedger } from "#lib/domain/ledger";
import type { Card, PurchaseList } from "#lib/domain/types";
import { applyPurge, previewPurge } from "#lib/storage/purge-run";
import { InMemoryRepository, type Repository } from "#lib/storage/repository";

const TODAY = "2026-10-30";

const makeCard = (id: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "0000",
	location: "krabi",
	// Closes on the 10th, so a purchase on the 5th lands in that month's statement.
	cycle: { kind: "offset", closeDay: 10, dueOffsetDays: 25 },
	archived: false,
});

const list = (id: string, date: string, status: PurchaseList["status"]) => ({
	id,
	date,
	status,
	lines: [],
});

/** `paid` has an old statement paid in full; `unpaid` has one nobody paid. */
async function seed(): Promise<Repository> {
	const repo = new InMemoryRepository();
	await repo.saveCard(makeCard("paid"));
	await repo.saveCard(makeCard("unpaid"));
	await repo.savePurchase({
		id: "p1",
		cardId: "paid",
		date: "2024-01-05",
		amount: 10000,
		note: "old",
	});
	await repo.savePurchase({
		id: "p2",
		cardId: "paid",
		date: "2026-10-05",
		amount: 5000,
		note: "recent",
	});
	await repo.saveCardPayment({
		id: "pay1",
		cardId: "paid",
		date: "2024-02-20",
		amount: 10000,
		status: "paid",
	});
	await repo.savePurchase({
		id: "u1",
		cardId: "unpaid",
		date: "2024-01-05",
		amount: 7000,
		note: "old unpaid",
	});
	await repo.savePurchaseList(list("saved-old", "2024-01-06", "saved"));
	await repo.savePurchaseList(list("draft-old", "2024-01-06", "draft"));
	return repo;
}

async function balances(repo: Repository) {
	const [payments, purchases] = [
		(
			await Promise.all(
				(await repo.listCards()).map((c) => repo.listCardPayments(c.id)),
			)
		).flat(),
		(
			await Promise.all(
				(await repo.listCards()).map((c) => repo.listPurchases(c.id)),
			)
		).flat(),
	];
	const frozen = (
		await Promise.all(
			(await repo.listCards()).map((c) => repo.listStatementDates(c.id)),
		)
	).flat();
	return (await repo.listCards()).map((c) => {
		const l = cardLedger(c, purchases, payments, frozen, TODAY);
		return [c.id, l.owed, l.credit];
	});
}

describe("previewPurge", () => {
	test("counts only the paid card's old purchases; older counts both", async () => {
		const repo = await seed();
		const { plan, older, cutoff } = await previewPurge(repo, "1y", TODAY);
		expect(plan.purchaseIds).toEqual(["p1"]);
		expect(older).toBe(2);
		expect(cutoff).toBe("2025-10-30");
	});

	test("all with nothing paid plans nothing", async () => {
		const repo = new InMemoryRepository();
		await repo.saveCard(makeCard("unpaid"));
		await repo.savePurchase({
			id: "u1",
			cardId: "unpaid",
			date: "2024-01-05",
			amount: 7000,
			note: "",
		});
		const { plan, older } = await previewPurge(repo, "all", TODAY);
		expect(plan.purchaseIds).toEqual([]);
		expect(older).toBe(1);
		await applyPurge(repo, plan);
		expect(await repo.listPurchases("unpaid")).toHaveLength(1);
	});
});

describe("applyPurge", () => {
	test("keeps every balance, drops old saved lists, keeps drafts", async () => {
		const repo = await seed();
		const before = await balances(repo);
		const { plan } = await previewPurge(repo, "1y", TODAY);
		await applyPurge(repo, plan);

		expect(await balances(repo)).toEqual(before);
		expect((await repo.listPurchases("paid")).map((p) => p.id)).toEqual(["p2"]);
		expect(await repo.listPurchases("unpaid")).toHaveLength(1);
		expect(await repo.listCardPayments("paid")).toEqual([]);
		const ids = (await repo.listPurchaseLists()).map((l) => l.id);
		expect(ids).toEqual(["draft-old"]);
	});

	test("saves a trimmed payment and deletes frozen dates named in the plan", async () => {
		const repo = new InMemoryRepository();
		await repo.saveCard(makeCard("paid"));
		await repo.savePurchase({
			id: "p1",
			cardId: "paid",
			date: "2024-01-05",
			amount: 6000,
			note: "",
		});
		await repo.saveCardPayment({
			id: "big",
			cardId: "paid",
			date: "2024-02-20",
			amount: 10000,
			status: "paid",
		});
		await repo.saveStatementDates({
			cardId: "paid",
			period: "2024-01",
			closeDate: "2024-01-10",
			dueDate: "2024-02-04",
		});
		const before = await balances(repo);
		const { plan } = await previewPurge(repo, "1y", TODAY);
		expect(plan.trimmed).toHaveLength(1);
		await applyPurge(repo, plan);

		expect(await balances(repo)).toEqual(before);
		expect((await repo.listCardPayments("paid")).map((p) => p.amount)).toEqual([
			4000,
		]);
		expect(await repo.listStatementDates("paid")).toEqual([]);
	});
});
