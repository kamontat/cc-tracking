import { expect, test } from "bun:test";
import "#components/cc-quick-add";
import type { Card } from "#lib/domain/types";

const cards: Card[] = [
	{
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
	},
];

const mount = async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-quick-add");
	element.cards = cards;
	element.today = "2026-09-21";
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const fill = (element: HTMLElement, name: string, value: string) => {
	const field = element.shadowRoot?.querySelector<HTMLInputElement>(
		`[name="${name}"]`,
	);
	if (!field) throw new Error(`no field named ${name}`);
	field.value = value;
	field.dispatchEvent(new Event("input", { bubbles: true }));
};

const submit = (element: HTMLElement) =>
	element.shadowRoot
		?.querySelector("form")
		?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

test("defaults the date to today", async () => {
	const element = await mount();
	const date =
		element.shadowRoot?.querySelector<HTMLInputElement>('[name="date"]');
	expect(date?.value).toBe("2026-09-21");
});

test("emits the purchase in satang", async () => {
	const element = await mount();
	let detail:
		| { cardId: string; date: string; amount: number; note: string }
		| undefined;
	element.addEventListener("add", (event) => {
		detail = (event as CustomEvent<typeof detail>).detail;
	});

	fill(element, "amount", "1,234.56");
	fill(element, "note", "office supplies");
	submit(element);

	expect(detail).toEqual({
		cardId: "kbank",
		date: "2026-09-21",
		amount: 123_456,
		note: "office supplies",
	});
});

test("refuses an invalid amount and says why", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("add", () => {
		emitted = true;
	});

	fill(element, "amount", "free");
	submit(element);
	await element.updateComplete;

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("amount");
});

test("refuses an impossible date", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("add", () => {
		emitted = true;
	});

	fill(element, "date", "2026-02-30");
	fill(element, "amount", "100");
	submit(element);
	await element.updateComplete;

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("date");
});

test("refuses a future-dated purchase and emits no add event", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("add", () => {
		emitted = true;
	});

	fill(element, "date", "2026-09-22");
	fill(element, "amount", "100");
	submit(element);
	await element.updateComplete;

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("future");
});

test("accepts a purchase dated exactly today, the boundary", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("add", () => {
		emitted = true;
	});

	fill(element, "date", "2026-09-21");
	fill(element, "amount", "100");
	submit(element);
	await element.updateComplete;

	expect(emitted).toBe(true);
});

test("keeps the date defaulted to today after a submit, so a second entry can follow immediately", async () => {
	const element = await mount();
	const details: Array<{
		cardId: string;
		date: string;
		amount: number;
		note: string;
	}> = [];
	element.addEventListener("add", (event) => {
		details.push((event as CustomEvent<(typeof details)[number]>).detail);
	});

	fill(element, "amount", "100");
	submit(element);

	const date =
		element.shadowRoot?.querySelector<HTMLInputElement>('[name="date"]');
	expect(date?.value).toBe("2026-09-21");

	fill(element, "amount", "200");
	submit(element);

	expect(details).toHaveLength(2);
	expect(details[1]).toEqual({
		cardId: "kbank",
		date: "2026-09-21",
		amount: 20_000,
		note: "",
	});
});

test("shows the answer the page gives it", async () => {
	const element = await mount();
	element.answer =
		"Lands on the statement closing 18 Sep 2026 — pay by 3 Oct 2026.";
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("pay by 3 Oct 2026");
});
