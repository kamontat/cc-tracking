import { expect, test } from "bun:test";
import "#components/cc-statement-list";
import { buildStatement } from "#lib/domain/statement";
import type { Card, Purchase, StatementPayment } from "#lib/domain/types";

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
	expect(text).toContain("3 Oct 2026");
	expect(text).toContain("fuel");
	expect(text).toContain("฿350.00");
});

test("shows a paid statement as paid, with its payment date", async () => {
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Paid 1 Sep 2026");
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
