import { beforeEach, describe, expect, test } from "bun:test";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types.ts";
import type { Repository } from "#lib/storage/repository.ts";

export const sampleCard = (overrides: Partial<Card> = {}): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "Krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	...overrides,
});

export const samplePurchase = (overrides: Partial<Purchase> = {}): Purchase => ({
	id: "p1",
	cardId: "kbank",
	date: "2026-09-05",
	amount: 10_000,
	note: "fuel",
	...overrides,
});

export const samplePayment = (overrides: Partial<StatementPayment> = {}): StatementPayment => ({
	cardId: "kbank",
	period: "2026-09",
	paidAt: "2026-10-01",
	closeDate: "2026-09-18",
	dueDate: "2026-10-03",
	...overrides,
});

/** Runs the behaviour every Repository implementation must have. */
export function repositoryContract(name: string, create: () => Repository): void {
	describe(`${name} repository contract`, () => {
		let repo: Repository;

		beforeEach(() => {
			repo = create();
		});

		test("returns nothing before anything is saved", async () => {
			expect(await repo.listCards()).toEqual([]);
			expect(await repo.getCard("kbank")).toBeNull();
			expect(await repo.listPurchases("kbank")).toEqual([]);
			expect(await repo.listPayments("kbank")).toEqual([]);
		});

		test("saves and reads a card back whole", async () => {
			const card = sampleCard({ comment: "company car fuel" });
			await repo.saveCard(card);
			expect(await repo.getCard("kbank")).toEqual(card);
			expect(await repo.listCards()).toEqual([card]);
		});

		test("saving the same id replaces the card", async () => {
			await repo.saveCard(sampleCard());
			await repo.saveCard(sampleCard({ location: "Bangkok" }));
			const cards = await repo.listCards();
			expect(cards).toHaveLength(1);
			expect(cards[0]?.location).toBe("Bangkok");
		});

		test("stores both cycle rule kinds", async () => {
			await repo.saveCard(sampleCard({ id: "scb", cycle: { kind: "fixed", closeDay: 18, dueDay: 5 } }));
			expect((await repo.getCard("scb"))?.cycle).toEqual({ kind: "fixed", closeDay: 18, dueDay: 5 });
		});

		test("deletes a card", async () => {
			await repo.saveCard(sampleCard());
			await repo.deleteCard("kbank");
			expect(await repo.getCard("kbank")).toBeNull();
		});

		test("lists purchases of one card only, sorted by date", async () => {
			await repo.savePurchase(samplePurchase({ id: "p2", date: "2026-09-20" }));
			await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-09-05" }));
			await repo.savePurchase(samplePurchase({ id: "p3", cardId: "scb", date: "2026-09-06" }));

			expect((await repo.listPurchases("kbank")).map((p) => p.id)).toEqual(["p1", "p2"]);
		});

		test("limits purchases to a date range, inclusive at both ends", async () => {
			await repo.savePurchase(samplePurchase({ id: "p1", date: "2026-08-31" }));
			await repo.savePurchase(samplePurchase({ id: "p2", date: "2026-09-01" }));
			await repo.savePurchase(samplePurchase({ id: "p3", date: "2026-09-30" }));
			await repo.savePurchase(samplePurchase({ id: "p4", date: "2026-10-01" }));

			const inRange = await repo.listPurchases("kbank", "2026-09-01", "2026-09-30");
			expect(inRange.map((p) => p.id)).toEqual(["p2", "p3"]);
		});

		test("saving the same purchase id replaces it", async () => {
			await repo.savePurchase(samplePurchase({ amount: 10_000 }));
			await repo.savePurchase(samplePurchase({ amount: 25_000 }));
			const purchases = await repo.listPurchases("kbank");
			expect(purchases).toHaveLength(1);
			expect(purchases[0]?.amount).toBe(25_000);
		});

		test("deletes a purchase", async () => {
			await repo.savePurchase(samplePurchase());
			await repo.deletePurchase("kbank", "p1");
			expect(await repo.listPurchases("kbank")).toEqual([]);
		});

		test("saves, lists, and deletes payments per card", async () => {
			await repo.savePayment(samplePayment({ period: "2026-09" }));
			await repo.savePayment(samplePayment({ period: "2026-08" }));
			await repo.savePayment(samplePayment({ cardId: "scb", period: "2026-09" }));

			expect((await repo.listPayments("kbank")).map((p) => p.period)).toEqual(["2026-08", "2026-09"]);

			await repo.deletePayment("kbank", "2026-08");
			expect((await repo.listPayments("kbank")).map((p) => p.period)).toEqual(["2026-09"]);
		});

		test("deleting something absent is not an error", async () => {
			await repo.deleteCard("nope");
			await repo.deletePurchase("nope", "nope");
			await repo.deletePayment("nope", "2026-01");
		});

		test("returned objects are copies, not live references", async () => {
			await repo.saveCard(sampleCard());
			const card = await repo.getCard("kbank");
			if (card) card.name = "mutated";
			expect((await repo.getCard("kbank"))?.name).toBe("KBank Visa");
		});
	});
}
