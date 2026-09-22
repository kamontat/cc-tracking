import { beforeEach, expect, test } from "bun:test";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { addDays, addPeriods, today } from "#lib/domain/date";
import type { Card, Purchase } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository } from "#lib/storage/repository";
import { renderDashboardPage } from "./index";

// Other test files leave the locale singleton set to "th"; pin it so this file's
// English date assertions do not depend on suite run order.
beforeEach(() => {
	setLocale("en");
});

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
	location: "krabi",
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

/** A repository whose savePurchase always rejects, to exercise the failure path in isolation. */
class RejectingPurchaseRepository extends InMemoryRepository {
	override savePurchase(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

// closeDay 18, dueOffsetDays 15: a purchase on the 18th closes that same month's
// statement; one on the 19th spills into the following month's statement instead.
const quickAddCard: Card = {
	id: "scb",
	name: "SCB Mastercard",
	last4: "1234",
	location: "bangkok",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const fillQuickAdd = (quickAdd: HTMLElement, name: string, value: string) => {
	const field = quickAdd.shadowRoot?.querySelector<
		HTMLInputElement | HTMLSelectElement
	>(`[name="${name}"]`);
	if (!field) throw new Error(`no field named ${name}`);
	field.value = value;
	field.dispatchEvent(new Event("input", { bubbles: true }));
};

const submitQuickAdd = (quickAdd: HTMLElement) =>
	quickAdd.shadowRoot
		?.querySelector("form")
		?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

test("a purchase dated on the close day lands on that statement", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(quickAddCard);
	const root = mount();
	renderDashboardPage(repo, root);
	await settle();

	const quickAdd = root.querySelector("cc-quick-add");
	await quickAdd?.updateComplete;
	if (!quickAdd) throw new Error("cc-quick-add did not mount");

	fillQuickAdd(quickAdd, "cardId", "scb");
	fillQuickAdd(quickAdd, "date", "2026-09-18");
	fillQuickAdd(quickAdd, "amount", "500");
	fillQuickAdd(quickAdd, "note", "dinner");
	submitQuickAdd(quickAdd);
	await settle();

	expect(bannerMessage(root)).toBe("");
	const purchases = await repo.listPurchases("scb");
	expect(purchases).toHaveLength(1);
	expect(purchases[0]).toMatchObject({
		cardId: "scb",
		date: "2026-09-18",
		amount: 50_000,
		note: "dinner",
	});
	expect(quickAdd.answer).toBe(
		"Lands on the statement closing 18 Sep 2026 — pay by 03 Oct 2026.",
	);
	await quickAdd.updateComplete;
	expect(quickAdd.shadowRoot?.textContent).toContain("pay by 03 Oct 2026");
});

test("a purchase dated the day after the close day lands on the next statement", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(quickAddCard);
	const root = mount();
	renderDashboardPage(repo, root);
	await settle();

	const quickAdd = root.querySelector("cc-quick-add");
	await quickAdd?.updateComplete;
	if (!quickAdd) throw new Error("cc-quick-add did not mount");

	fillQuickAdd(quickAdd, "cardId", "scb");
	fillQuickAdd(quickAdd, "date", "2026-09-19");
	fillQuickAdd(quickAdd, "amount", "500");
	submitQuickAdd(quickAdd);
	await settle();

	const purchases = await repo.listPurchases("scb");
	expect(purchases).toHaveLength(1);
	expect(purchases[0]?.date).toBe("2026-09-19");
	expect(quickAdd.answer).toBe(
		"Lands on the statement closing 18 Oct 2026 — pay by 02 Nov 2026.",
	);
});

test("a failed purchase save leaves a message in the banner and stores nothing", async () => {
	const repo = new RejectingPurchaseRepository();
	await repo.saveCard(quickAddCard);
	const root = mount();
	renderDashboardPage(repo, root);
	await settle();

	const quickAdd = root.querySelector("cc-quick-add");
	await quickAdd?.updateComplete;
	if (!quickAdd) throw new Error("cc-quick-add did not mount");

	fillQuickAdd(quickAdd, "cardId", "scb");
	fillQuickAdd(quickAdd, "date", "2026-09-18");
	fillQuickAdd(quickAdd, "amount", "500");
	submitQuickAdd(quickAdd);
	await settle();

	expect(bannerMessage(root)).toContain("disk is full");
	expect(await repo.listPurchases("scb")).toEqual([]);
	expect(quickAdd.answer).toBe("");
});

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

test("marking paid freezes the dates of the event's own period, not whatever nextActionable recomputes", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	// A second, later statement that has also already closed and gone unpaid. `nextActionable`
	// would return `period` (the oldest unpaid one), but this test asks to mark `newerPeriod`
	// paid instead, by dispatching the event directly rather than clicking the row -- exactly
	// the kind of stale-period request nothing else in this flow currently prevents.
	const newerPeriod = addPeriods(period, 1);
	await repo.savePurchase({
		id: "b",
		cardId: "kbank",
		date: closeDateOf(card.cycle, newerPeriod),
		amount: 12_000,
		note: "parts",
	});
	const root = mount();
	renderDashboardPage(repo, root);
	await settle();

	const list = root.querySelector("cc-due-list");
	await list?.updateComplete;
	list?.dispatchEvent(
		new CustomEvent("mark-paid", {
			detail: { cardId: "kbank", period: newerPeriod },
		}),
	);
	await settle();

	expect(bannerMessage(root)).toBe("");
	const payments = await repo.listPayments("kbank");
	expect(payments).toHaveLength(1);
	expect(payments[0]?.period).toBe(newerPeriod);
	expect(payments[0]?.closeDate).toBe(closeDateOf(card.cycle, newerPeriod));
	expect(payments[0]?.dueDate).toBe(dueDateOf(card.cycle, newerPeriod));
});
