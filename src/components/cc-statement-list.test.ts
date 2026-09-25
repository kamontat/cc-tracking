import { expect, test } from "bun:test";
import "#components/cc-statement-list";
import { buildStatement } from "#lib/domain/statement";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const purchases: Purchase[] = [
	{
		id: "a",
		cardId: "kbank",
		date: "2026-09-05",
		amount: 10_000,
		note: "fuel",
	},
	{
		id: "b",
		cardId: "kbank",
		date: "2026-09-18",
		amount: 25_000,
		note: "parts",
	},
];

const payment: StatementPayment = {
	cardId: "kbank",
	period: "2026-08",
	paidAt: "2026-09-01",
	closeDate: "2026-08-18",
	dueDate: "2026-09-02",
};

const mount = async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-statement-list");
	element.statements = [
		buildStatement(card, "2026-09", purchases),
		buildStatement(card, "2026-08", purchases, payment),
	];
	element.today = "2026-09-25";
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("lists each statement with its dates, purchases, and total", async () => {
	const element = await mount();
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("18 Sep 2026");
	expect(text).toContain("03 Oct 2026");
	expect(text).toContain("fuel");
	expect(text).toContain("฿350.00");
});

const detailsFor = (element: Element, period: string): HTMLDetailsElement => {
	const found = [
		...(element.shadowRoot?.querySelectorAll<HTMLDetailsElement>("details") ??
			[]),
	].find((details) => details.textContent?.includes(period));
	if (!found) throw new Error(`no statement for period ${period}`);
	return found;
};

test("starts a month that has purchases open", async () => {
	const element = await mount();
	expect(detailsFor(element, "2026-09").open).toBe(true);
});

test("starts a month with no purchases collapsed", async () => {
	const element = await mount();
	expect(detailsFor(element, "2026-08").open).toBe(false);
});

test("names the period, the dates, and the total on the collapsed line", async () => {
	const element = await mount();
	const summary =
		detailsFor(element, "2026-08").querySelector("summary")?.textContent ?? "";
	expect(summary).toContain("2026-08");
	expect(summary).toContain("18 Aug 2026");
	expect(summary).toContain("02 Sep 2026");
	expect(summary).toContain("฿0.00");
});

test("shows a paid statement as paid, with its payment date", async () => {
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Paid 01 Sep 2026");
});

test("emits mark-paid for an unpaid statement", async () => {
	const element = await mount();
	let detail: { cardId: string; period: string } | undefined;
	element.addEventListener("mark-paid", (event) => {
		detail = (event as CustomEvent<{ cardId: string; period: string }>).detail;
	});
	element.shadowRoot
		?.querySelector<HTMLButtonElement>("[data-action='mark-paid']")
		?.click();
	expect(detail).toEqual({ cardId: "kbank", period: "2026-09" });
});

test("offers no mark-paid on the still-open statement, but keeps it on a closed unpaid one", async () => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-statement-list");
	element.statements = [
		// Closes 18 Sep; "today" below is before that, so this period is still open.
		buildStatement(card, "2026-09", purchases),
		// Closes 18 Aug, long since past, unpaid -- and owing something, since a closed month
		// with nothing on it folds into a quiet line with no button at all.
		buildStatement(card, "2026-08", [
			...purchases,
			{ id: "c", cardId: "kbank", date: "2026-08-10", amount: 5_000, note: "" },
		]),
	];
	element.today = "2026-09-10";
	document.body.append(element);
	await element.updateComplete;

	const openArticle = [
		...(element.shadowRoot?.querySelectorAll("article") ?? []),
	].find((article) => article.getAttribute("data-urgency") === "future");
	const closedArticle = [
		...(element.shadowRoot?.querySelectorAll("article") ?? []),
	].find((article) => article.getAttribute("data-urgency") !== "future");

	expect(openArticle?.querySelector("[data-action='mark-paid']")).toBeNull();
	expect(openArticle?.textContent).toContain("still open");
	expect(
		closedArticle?.querySelector("[data-action='mark-paid']"),
	).not.toBeNull();
});

test("emits unmark-paid for a paid statement", async () => {
	const element = await mount();
	let detail: { cardId: string; period: string } | undefined;
	element.addEventListener("unmark-paid", (event) => {
		detail = (event as CustomEvent<{ cardId: string; period: string }>).detail;
	});
	element.shadowRoot
		?.querySelector<HTMLButtonElement>("[data-action='unmark-paid']")
		?.click();
	expect(detail).toEqual({ cardId: "kbank", period: "2026-08" });
});

test("emits delete-purchase with the purchase id", async () => {
	const element = await mount();
	let detail: { cardId: string; purchaseId: string } | undefined;
	element.addEventListener("delete-purchase", (event) => {
		detail = (event as CustomEvent<{ cardId: string; purchaseId: string }>)
			.detail;
	});
	element.shadowRoot
		?.querySelector<HTMLButtonElement>("[data-action='delete-purchase']")
		?.click();
	expect(detail).toEqual({ cardId: "kbank", purchaseId: "a" });
});

test("renders its statement text and buttons in the chosen language", async () => {
	setLocale("en");
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Mark paid");
	expect(element.shadowRoot?.textContent).toContain("Unmark");
	expect(element.shadowRoot?.textContent).toContain("Delete");
	expect(element.shadowRoot?.textContent).toContain("Total");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("บันทึกว่าชำระแล้ว");
	expect(element.shadowRoot?.textContent).toContain("ยกเลิกเครื่องหมาย");
	expect(element.shadowRoot?.textContent).toContain("ลบ");
	expect(element.shadowRoot?.textContent).toContain("รวม");
});

test("renders the destructive and secondary actions as their variants", async () => {
	const element = await mount();

	expect(
		element.shadowRoot?.querySelector(
			'[data-action="delete-purchase"][data-variant="danger"]',
		),
	).not.toBeNull();
	expect(
		element.shadowRoot?.querySelector(
			'[data-action="unmark-paid"][data-variant="quiet"]',
		),
	).not.toBeNull();
});

const mountStatements = async (
	statements: ReturnType<typeof buildStatement>[],
	today = "2026-09-25",
) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-statement-list");
	element.statements = statements;
	element.today = today;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("folds a run of closed, empty, unpaid months into one quiet line", async () => {
	const element = await mountStatements([
		// Open (closes 18 Oct, after today): kept whole even with nothing on it.
		buildStatement(card, "2026-10", purchases),
		buildStatement(card, "2026-09", purchases),
		// Empty but paid: kept whole, so the payment can still be undone.
		buildStatement(card, "2026-08", purchases, payment),
		buildStatement(card, "2026-07", purchases),
		buildStatement(card, "2026-06", purchases),
		buildStatement(card, "2026-05", purchases),
	]);
	const shadow = element.shadowRoot;
	const periods = [...(shadow?.querySelectorAll("article .period") ?? [])].map(
		(node) => node.textContent,
	);
	expect(periods).toEqual(["2026-10", "2026-09", "2026-08"]);

	const quiet = [...(shadow?.querySelectorAll(".quiet") ?? [])];
	expect(quiet).toHaveLength(1);
	// Oldest first, so the range reads forwards.
	expect(quiet[0]?.textContent?.trim()).toBe(
		"2026-05 – 2026-07 · no purchases",
	);
});

test("names a lone quiet month on its own, and breaks runs around a month with purchases", async () => {
	const june: Purchase = {
		id: "c",
		cardId: "kbank",
		date: "2026-06-10",
		amount: 5_000,
		note: "tyres",
	};
	const element = await mountStatements([
		buildStatement(card, "2026-08", [june]),
		buildStatement(card, "2026-07", [june]),
		buildStatement(card, "2026-06", [june]),
		buildStatement(card, "2026-05", [june]),
	]);
	const quiet = [...(element.shadowRoot?.querySelectorAll(".quiet") ?? [])].map(
		(node) => node.textContent?.trim(),
	);
	expect(quiet).toEqual([
		"2026-07 – 2026-08 · no purchases",
		"2026-05 · no purchases",
	]);
	expect(element.shadowRoot?.textContent).toContain("tyres");
});

test("says so when there are no statements, in the chosen language", async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-statement-list");
	element.statements = [];
	element.today = "2026-09-25";
	document.body.append(element);
	await element.updateComplete;

	setLocale("en");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("No statements yet.");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("ยังไม่มีใบแจ้งยอด");
});
