import { expect, test } from "bun:test";
import "#components/cc-payment-form";
import type { PaymentDetail } from "#components/cc-payment-form";
import { buildStatement } from "#lib/domain/statement";
import type { Card, Purchase } from "#lib/domain/types";
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
		amount: 10_000_000,
		note: "laptop",
	},
];

const partly = buildStatement(card, "2026-09", purchases, {
	cardId: "kbank",
	period: "2026-09",
	paidAt: "2026-09-27",
	closeDate: "2026-09-18",
	dueDate: "2026-10-03",
	parts: [{ paidAt: "2026-09-27", amount: 4_000_000 }],
});

const mount = async (statement = partly) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-payment-form");
	element.statement = statement;
	element.today = "2026-09-28";
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const field = (element: HTMLElement, name: string) =>
	element.shadowRoot?.querySelector<HTMLInputElement>(`[name="${name}"]`);

const submit = (element: HTMLElement) =>
	element.shadowRoot
		?.querySelector("form")
		?.dispatchEvent(new Event("submit", { cancelable: true }));

test("starts at today and what is left to pay", async () => {
	const element = await mount();
	expect(field(element, "date")?.value).toBe("2026-09-28");
	expect(field(element, "amount")?.value).toBe("60000");
});

test("shows the statement's total, what is paid and what is left", async () => {
	const element = await mount();
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("฿100,000.00");
	expect(text).toContain("฿40,000.00");
	expect(text).toContain("฿60,000.00");
});

test("emits pay with the statement, date and amount", async () => {
	const element = await mount();
	let detail: PaymentDetail | undefined;
	element.addEventListener("pay", (event) => {
		detail = (event as CustomEvent<PaymentDetail>).detail;
	});
	const amount = field(element, "amount");
	if (amount) amount.value = "20,000";
	const date = field(element, "date");
	if (date) date.value = "2026-09-29";
	submit(element);
	expect(detail).toEqual({
		cardId: "kbank",
		period: "2026-09",
		paidAt: "2026-09-29",
		amount: 2_000_000,
	});
});

test("refuses an amount that is not baht, and says why", async () => {
	const element = await mount();
	let fired = false;
	element.addEventListener("pay", () => {
		fired = true;
	});
	const amount = field(element, "amount");
	if (amount) amount.value = "lots";
	submit(element);
	await element.updateComplete;
	expect(fired).toBe(false);
	expect(element.shadowRoot?.querySelector("[role='alert']")?.textContent).toBe(
		"Enter the amount in baht, like 1234.56.",
	);
});

test("refuses a date that does not exist", async () => {
	const element = await mount();
	let fired = false;
	element.addEventListener("pay", () => {
		fired = true;
	});
	const date = field(element, "date");
	if (date) date.value = "2026-02-30";
	submit(element);
	await element.updateComplete;
	expect(fired).toBe(false);
	expect(element.shadowRoot?.querySelector("[role='alert']")).not.toBeNull();
});

test("emits cancel from its quiet cancel button", async () => {
	const element = await mount();
	let cancelled = false;
	element.addEventListener("cancel", () => {
		cancelled = true;
	});
	element.shadowRoot
		?.querySelector<HTMLButtonElement>(
			'[data-action="cancel"][data-variant="quiet"]',
		)
		?.click();
	expect(cancelled).toBe(true);
});

test("renders in Thai", async () => {
	const element = await mount();
	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("วันที่ชำระ");
	setLocale("en");
});
