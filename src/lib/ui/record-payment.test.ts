import { expect, test } from "bun:test";
import type { Card, CardPayment, Purchase } from "#lib/domain/types";
import { InMemoryRepository } from "#lib/storage/repository";
import { loadMoneyData } from "#lib/ui/money-data";
import { deletePayment, savePayment } from "#lib/ui/record-payment";

const TODAY = "2026-10-31";

const card: Card = {
	id: "A",
	name: "A",
	last4: "0000",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
	archived: false,
	limitGroupId: "g1",
};
const purchase: Purchase = {
	id: "p1",
	cardId: "A",
	date: "2026-09-10",
	amount: 10_000_00,
	note: "fuel",
};
const payment = (status: CardPayment["status"]): CardPayment => ({
	id: "c1",
	cardId: "A",
	date: "2026-10-01",
	amount: 4_000_00,
	status,
});

const setup = async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	return repo;
};

test("saving a paid payment freezes the statements it reaches", async () => {
	const repo = await setup();
	const data = await loadMoneyData(repo, TODAY);

	await savePayment(repo, data, payment("paid"), TODAY);

	expect(await repo.listCardPayments("A")).toEqual([payment("paid")]);
	const dates = await repo.listStatementDates("A");
	expect(dates.map((d) => d.period)).toEqual(["2026-09"]);
});

test("a planned payment freezes none", async () => {
	const repo = await setup();
	const data = await loadMoneyData(repo, TODAY);

	await savePayment(repo, data, payment("planned"), TODAY);

	expect(await repo.listCardPayments("A")).toHaveLength(1);
	expect(await repo.listStatementDates("A")).toEqual([]);
});

test("deletePayment removes the stored payment", async () => {
	const repo = await setup();
	await repo.saveCardPayment(payment("paid"));

	await deletePayment(repo, payment("paid"));

	expect(await repo.listCardPayments("A")).toEqual([]);
});
