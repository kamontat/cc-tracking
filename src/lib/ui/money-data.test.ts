import { expect, test } from "bun:test";
import type { Settings } from "#lib/domain/settings";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types";
import { PAYMENTS_MIGRATION_KEY } from "#lib/storage/migrate-payments";
import { InMemoryRepository } from "#lib/storage/repository";
import { loadMoneyData } from "#lib/ui/money-data";

const TODAY = "2026-10-31";

const card = (id: string, extra: Partial<Card> = {}): Card => ({
	id,
	name: id,
	last4: "0000",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
	...extra,
});

const purchase: Purchase = {
	id: "p1",
	cardId: "A",
	date: "2026-09-10",
	amount: 10_000_00,
	note: "fuel",
};

test("old payments settle the ledger without being written", async () => {
	globalThis.localStorage.clear();
	const repo = new InMemoryRepository();
	await repo.saveCard(card("A"));
	await repo.savePurchase(purchase);
	const old: StatementPayment = {
		cardId: "A",
		period: "2026-09",
		paidAt: "2026-10-01",
		closeDate: "2026-09-25",
		dueDate: "2026-10-15",
		parts: [{ paidAt: "2026-10-01", amount: 10_000_00 }],
	};
	await repo.savePayment(old);

	const data = await loadMoneyData(repo, TODAY);

	expect(data.ledgers.get("A")?.owed).toBe(0);
	expect(data.purchases).toEqual([purchase]);
	expect(await repo.listCardPayments("A")).toEqual([]);
	expect(await repo.listStatementDates("A")).toEqual([]);
	expect(globalThis.localStorage.getItem(PAYMENTS_MIGRATION_KEY)).toBeNull();
});

test("lists, settings and archived cards come back", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card("A"));
	await repo.saveCard(card("Z", { archived: true }));
	await repo.saveLimitGroup({ id: "g1", name: "G1", limit: 100_000_00 });
	const draft = {
		id: "l1",
		date: "2026-10-30",
		status: "draft" as const,
		lines: [{ cardId: "A", amount: 1_000_00 }],
	};
	await repo.savePurchaseList(draft);
	const settings: Settings = { purchaseLocations: ["krabi"] };
	await repo.saveSettings(settings);

	const data = await loadMoneyData(repo, TODAY);

	expect(data.lists).toEqual([draft]);
	expect(data.settings).toEqual(settings);
	expect(data.groups.map((g) => g.id)).toEqual(["g1"]);
	expect(data.cards.map((c) => c.id).sort()).toEqual(["A", "Z"]);
	expect(data.ledgers.has("Z")).toBe(true);
});
