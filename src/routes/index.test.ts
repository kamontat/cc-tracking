import { expect, test } from "bun:test";
import { periodOfPurchase } from "#lib/domain/cycle.ts";
import { addDays, today } from "#lib/domain/date.ts";
import type { Card, Purchase } from "#lib/domain/types.ts";
import { InMemoryRepository } from "#lib/storage/repository.ts";
import { renderDashboardPage } from "./index.ts";

/** Flushes Lit's microtask-based update chain (page state machine and nested components alike). */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const mount = (): HTMLElement => {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	document.body.append(root);
	return root;
};

const bannerMessage = (root: HTMLElement): string =>
	root.querySelector("cc-error-banner")?.message ?? "";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "Krabi",
	cycle: { kind: "offset", closeDay: 1, dueOffsetDays: 5 },
	archived: false,
};

// 70 days ago is well outside the current period, so this purchase always lands in a
// statement that is already closed, unpaid, and overdue -- regardless of what "today" is
// when the test runs -- giving the row a "Mark paid" button to click.
const purchaseDate = addDays(today(), -70);
const period = periodOfPurchase(card.cycle, purchaseDate);
const purchase: Purchase = {
	id: "a",
	cardId: "kbank",
	date: purchaseDate,
	amount: 35_000,
	note: "fuel",
};

/** A repository whose savePayment always rejects, to exercise the failure path in isolation. */
class RejectingPaymentRepository extends InMemoryRepository {
	override savePayment(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

test("a failed mark-paid keeps its error message after the refresh that follows it", async () => {
	const repo = new RejectingPaymentRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = mount();
	renderDashboardPage(repo, root);
	await settle();

	const list = root.querySelector("cc-due-list");
	await list?.updateComplete;
	list?.shadowRoot?.querySelector<HTMLButtonElement>("button")?.click();
	await settle();

	expect(bannerMessage(root)).toContain("disk is full");
	expect(await repo.listPayments("kbank")).toEqual([]);
});

test("marking a statement paid records the payment and clears it from the due list", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = mount();
	renderDashboardPage(repo, root);
	await settle();

	const list = root.querySelector("cc-due-list");
	await list?.updateComplete;
	list?.shadowRoot?.querySelector<HTMLButtonElement>("button")?.click();
	await settle();

	expect(bannerMessage(root)).toBe("");
	const payments = await repo.listPayments("kbank");
	expect(payments).toHaveLength(1);
	expect(payments[0]?.period).toBe(period);

	const listAfter = root.querySelector("cc-due-list");
	await listAfter?.updateComplete;
	expect(listAfter?.shadowRoot?.querySelector("button")).toBeNull();
	expect(
		listAfter?.shadowRoot?.querySelector("[data-urgency='overdue']"),
	).toBeNull();
});
