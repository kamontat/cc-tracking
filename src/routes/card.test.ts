import { expect, test } from "bun:test";
import { closeDateOf, dueDateOf, periodOfPurchase } from "#lib/domain/cycle";
import { addDays, addPeriods, today } from "#lib/domain/date";
import type { Card, Purchase } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { InMemoryRepository } from "#lib/storage/repository";
import { renderCardPage } from "./card";

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

/**
 * Every unpaid statement (including the currently open one, with no purchases) renders a
 * "Mark paid" button, so a test that cares about a specific period must scope its click to
 * that statement's <article>, not just grab the first mark-paid button on the page.
 */
const articleFor = (
	list: Element | null | undefined,
	targetPeriod: string,
): HTMLElement => {
	const article = [
		...(list?.shadowRoot?.querySelectorAll("article") ?? []),
	].find((element) => element.textContent?.includes(targetPeriod));
	if (!article) throw new Error(`no statement for period ${targetPeriod}`);
	return article as HTMLElement;
};

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

// 70 days ago is well outside the current period, so this purchase always lands in a
// statement that is already closed -- regardless of what "today" is when the test runs --
// giving the statement a "Mark paid" button to click.
const purchaseDate = addDays(today(), -70);
const period = periodOfPurchase(card.cycle, purchaseDate);
const purchase: Purchase = {
	id: "a",
	cardId: "kbank",
	date: purchaseDate,
	amount: 35_000,
	note: "fuel",
};

/** A repository whose savePurchase always rejects, to exercise the failure path in isolation. */
class RejectingPurchaseRepository extends InMemoryRepository {
	override savePurchase(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

/** Fills in and submits the page's quick-add form. */
const submitPurchase = async (
	root: HTMLElement,
	fields: { date: string; amount: string; note: string },
) => {
	const form = root.querySelector("cc-quick-add");
	await form?.updateComplete;
	const shadow = form?.shadowRoot;
	for (const [name, value] of Object.entries(fields)) {
		const input = shadow?.querySelector<HTMLInputElement>(`[name="${name}"]`);
		if (input) input.value = value;
	}
	shadow?.querySelector("form")?.requestSubmit();
	await settle();
};

/** A repository whose savePayment always rejects, to exercise the failure path in isolation. */
class RejectingPaymentRepository extends InMemoryRepository {
	override savePayment(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

/** A repository whose deletePayment always rejects, to exercise the failure path in isolation. */
class RejectingUnmarkRepository extends InMemoryRepository {
	override deletePayment(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

/** A repository whose deletePurchase always rejects, to exercise the failure path in isolation. */
class RejectingDeleteRepository extends InMemoryRepository {
	override deletePurchase(): Promise<void> {
		return Promise.reject(new Error("disk is full"));
	}
}

test("heads the page with the card's id, name, and last four digits", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	expect(root.querySelector(".page-heading h1")?.textContent).toContain(
		"KBank Visa",
	);
	const meta = root.querySelector(".page-heading .meta")?.textContent ?? "";
	expect(meta).toContain("kbank");
	expect(meta).toContain("4821");
	expect(meta).toContain("Krabi");
});

test("leads back to the card list", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	expect(
		root.querySelector<HTMLAnchorElement>("a.back")?.getAttribute("href"),
	).toBe("/cards");
});

test("badges an archived or supplementary card in its heading", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard({ ...card, archived: true, supplementary: true });
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	const badges = [...root.querySelectorAll(".page-heading .badge")].map(
		(badge) => badge.textContent?.trim(),
	);
	expect(badges).toEqual(["Archived", "Supplementary card"]);
});

test("sums up the group's room, this card's debt, and the next statement due", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	await repo.saveCard({ ...card, limitGroupId: "pool" });
	// A sibling on the same pool: its spending comes out of this card's room too.
	await repo.saveCard({ ...card, id: "scb", limitGroupId: "pool" });
	await repo.savePurchase(purchase);
	await repo.savePurchase({
		...purchase,
		id: "b",
		cardId: "scb",
		amount: 10_000,
	});
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	const summary = root.querySelector("cc-card-summary");
	expect(summary?.group?.id).toBe("pool");
	expect(summary?.used).toBe(45_000);
	expect(summary?.sharedWith).toBe(1);
	expect(summary?.owed).toBe(35_000);
	expect(summary?.next?.period).toBe(period);
});

test("describes the card beside its history, with a way to edit it", async () => {
	const repo = new InMemoryRepository();
	await repo.saveLimitGroup({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
		owner: "NT",
	});
	await repo.saveCard({ ...card, id: "k b", limitGroupId: "pool" });
	const root = mount();
	renderCardPage(repo, "k b", root);
	await settle();

	const panel = root.querySelector(".card-details");
	expect(panel?.textContent).toContain("KBank account");
	expect(panel?.textContent).toContain("NT");
	expect(
		panel?.querySelector<HTMLAnchorElement>("a.edit")?.getAttribute("href"),
	).toBe("/cards?edit=k%20b");
});

test("says why a card kept somewhere that takes no purchases has no purchase form", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard({ ...card, location: "bangkok" });
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	expect(root.querySelector("cc-quick-add")).toBeNull();
	expect(root.querySelector(".card-details")?.textContent).toContain(
		"Bangkok takes no new purchases.",
	);
});

test("gives an archived card no such note: archiving, not the place, is why", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard({ ...card, location: "bangkok", archived: true });
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	expect(root.querySelector(".card-details")?.textContent).not.toContain(
		"takes no new purchases",
	);
});

test("an unknown card id shows a message instead of a blank page", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderCardPage(repo, "does-not-exist", root);
	await settle();

	expect(bannerMessage(root)).toContain("does-not-exist");
	expect(root.querySelector("cc-statement-list")).toBeNull();
});

test("no card id at all shows a message instead of a blank page", async () => {
	const repo = new InMemoryRepository();
	const root = mount();
	renderCardPage(repo, null, root);
	await settle();

	expect(bannerMessage(root)).toContain("No card was selected.");
});

test('"Show older statements" reveals a period beyond the first twelve', async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);

	// The 13th statement back from the open period -- one past the first page of 12 --
	// gets a purchase of its own, so the test can anchor on real content (its period and
	// its purchase's note) rather than counting <article> elements alone.
	const openPeriod = periodOfPurchase(card.cycle, today());
	const farPeriod = addPeriods(openPeriod, -12);
	const farPurchase: Purchase = {
		id: "far",
		cardId: "kbank",
		date: closeDateOf(card.cycle, farPeriod),
		amount: 5_000,
		note: "vintage typewriter",
	};
	await repo.savePurchase(farPurchase);

	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	const list = root.querySelector("cc-statement-list");
	await list?.updateComplete;
	// Counted on the data, not the markup: the list folds empty months into quiet lines.
	expect(list?.statements).toHaveLength(12);
	expect(list?.shadowRoot?.textContent).not.toContain(farPeriod);
	expect(list?.shadowRoot?.textContent).not.toContain("vintage typewriter");

	const showOlder = root.querySelector<HTMLButtonElement>(
		"[data-action='show-older']",
	);
	expect(showOlder?.textContent?.trim()).toBe("Show older statements");
	showOlder?.click();
	await settle();

	const listAfter = root.querySelector("cc-statement-list");
	await listAfter?.updateComplete;
	expect(listAfter?.statements).toHaveLength(24);
	expect(listAfter?.shadowRoot?.textContent).toContain(farPeriod);
	expect(listAfter?.shadowRoot?.textContent).toContain("vintage typewriter");
});

test("marking a statement paid records a payment whose frozen dates match that statement", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	const list = root.querySelector("cc-statement-list");
	await list?.updateComplete;
	articleFor(list, period)
		.querySelector<HTMLButtonElement>("[data-action='mark-paid']")
		?.click();
	await settle();

	expect(bannerMessage(root)).toBe("");
	const payments = await repo.listPayments("kbank");
	expect(payments).toHaveLength(1);
	expect(payments[0]?.period).toBe(period);
	// The payment freezes the statement's own close/due dates at the moment it was paid.
	expect(payments[0]?.closeDate).toBe(closeDateOf(card.cycle, period));
	expect(payments[0]?.dueDate).toBe(dueDateOf(card.cycle, period));
});

test("unmarking a paid statement removes its payment", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	await repo.savePayment({
		cardId: "kbank",
		period,
		paidAt: today(),
		closeDate: "2020-01-18",
		dueDate: "2020-02-02",
	});
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	const list = root.querySelector("cc-statement-list");
	await list?.updateComplete;
	list?.shadowRoot
		?.querySelector<HTMLButtonElement>("[data-action='unmark-paid']")
		?.click();
	await settle();

	expect(bannerMessage(root)).toBe("");
	expect(await repo.listPayments("kbank")).toEqual([]);
});

test("deleting a purchase removes it from its statement", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	const list = root.querySelector("cc-statement-list");
	await list?.updateComplete;
	list?.shadowRoot
		?.querySelector<HTMLButtonElement>("[data-action='delete-purchase']")
		?.click();
	await settle();

	expect(bannerMessage(root)).toBe("");
	expect(await repo.listPurchases("kbank")).toEqual([]);
});

test("a failed mark-paid leaves a message in the banner and writes nothing", async () => {
	const repo = new RejectingPaymentRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	const list = root.querySelector("cc-statement-list");
	await list?.updateComplete;
	list?.shadowRoot
		?.querySelector<HTMLButtonElement>("[data-action='mark-paid']")
		?.click();
	await settle();

	expect(bannerMessage(root)).toContain("disk is full");
	expect(await repo.listPayments("kbank")).toEqual([]);
});

test("a failed unmark-paid leaves a message in the banner and keeps the payment", async () => {
	const repo = new RejectingUnmarkRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const existingPayment = {
		cardId: "kbank",
		period,
		paidAt: today(),
		closeDate: "2020-01-18",
		dueDate: "2020-02-02",
	};
	await repo.savePayment(existingPayment);
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	const list = root.querySelector("cc-statement-list");
	await list?.updateComplete;
	list?.shadowRoot
		?.querySelector<HTMLButtonElement>("[data-action='unmark-paid']")
		?.click();
	await settle();

	expect(bannerMessage(root)).toContain("disk is full");
	expect(await repo.listPayments("kbank")).toEqual([existingPayment]);
});

test("a failed delete-purchase leaves a message in the banner and keeps the purchase", async () => {
	const repo = new RejectingDeleteRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	const list = root.querySelector("cc-statement-list");
	await list?.updateComplete;
	list?.shadowRoot
		?.querySelector<HTMLButtonElement>("[data-action='delete-purchase']")
		?.click();
	await settle();

	expect(bannerMessage(root)).toContain("disk is full");
	expect(await repo.listPurchases("kbank")).toEqual([purchase]);
});

test("renders its controls in the chosen language", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	await repo.savePurchase(purchase);
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();
	expect(root.textContent).toContain("Show older statements");

	setLocale("th");
	await settle();
	expect(root.textContent).toContain("ดูใบแจ้งยอดเก่ากว่านี้");
});

test("adds a purchase against this card and says which statement it lands on", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard(card);
	// A second card, so the test proves the form is locked to this page's card.
	await repo.saveCard({ ...card, id: "scb", name: "SCB Mastercard" });
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	const form = root.querySelector("cc-quick-add");
	await form?.updateComplete;
	const options = [...(form?.shadowRoot?.querySelectorAll("option") ?? [])].map(
		(option) => option.value,
	);
	expect(options).toEqual(["kbank"]);

	await submitPurchase(root, {
		date: purchaseDate,
		amount: "1234.50",
		note: "groceries",
	});

	expect(bannerMessage(root)).toBe("");
	const saved = await repo.listPurchases("kbank");
	expect(saved).toHaveLength(1);
	expect(saved[0]).toMatchObject({
		cardId: "kbank",
		date: purchaseDate,
		amount: 123_450,
		note: "groceries",
	});
	expect(await repo.listPurchases("scb")).toEqual([]);

	const list = root.querySelector("cc-statement-list");
	await list?.updateComplete;
	expect(articleFor(list, period).textContent).toContain("groceries");
	await root.querySelector("cc-quick-add")?.updateComplete;
	expect(
		root.querySelector("cc-quick-add")?.shadowRoot?.querySelector(".answer")
			?.textContent,
	).toContain("Lands on the statement closing");
});

test("an archived card offers no purchase form", async () => {
	const repo = new InMemoryRepository();
	await repo.saveCard({ ...card, archived: true });
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	expect(root.querySelector("cc-statement-list")).not.toBeNull();
	expect(root.querySelector("cc-quick-add")).toBeNull();
});

test("a failed purchase leaves a message in the banner and writes nothing", async () => {
	const repo = new RejectingPurchaseRepository();
	await repo.saveCard(card);
	const root = mount();
	renderCardPage(repo, "kbank", root);
	await settle();

	await submitPurchase(root, {
		date: purchaseDate,
		amount: "100",
		note: "",
	});

	expect(bannerMessage(root)).toContain("disk is full");
	expect(await repo.listPurchases("kbank")).toEqual([]);
});
