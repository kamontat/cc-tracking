import { expect, test } from "bun:test";
import "#components/cc-quick-add";
import type { SpendRow } from "#lib/domain/limit";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

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

const otherCard: Card = {
	id: "scb",
	name: "SCB Mastercard",
	last4: "9002",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "solo",
};

const spendRow: SpendRow = {
	card: cards[0] as Card,
	group: { id: "pool", name: "KBank account", limit: 500_000 },
	used: 200_000,
	available: 300_000,
	closeDate: "2026-10-18",
	dueDate: "2026-11-02",
	sharedWith: 0,
};

const otherRow: SpendRow = {
	...spendRow,
	card: otherCard,
	group: { id: "solo", name: "SCB", limit: 100_000 },
	used: 0,
	available: 100_000,
};

// A third card that lands at the same array index `otherCard` occupied, so an unkeyed
// `.map()` over the options reuses that option's DOM node rather than adding or removing one.
const thirdCard: Card = {
	id: "ktb",
	name: "KTB Debit",
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "solo",
};

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

test("says so, and offers no form, when no card may take a purchase", async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-quick-add");
	element.cards = [];
	element.today = "2026-09-21";
	document.body.append(element);
	await element.updateComplete;

	expect(element.shadowRoot?.querySelector("form")).toBeNull();
	expect(element.shadowRoot?.textContent).toContain(
		"No card here can take a purchase",
	);
});

test("asks to be closed from its cancel button, beside the submit", async () => {
	const element = await mount();
	const cancelled: Event[] = [];
	element.addEventListener("cancel", (event) => cancelled.push(event));

	const cancel = element.shadowRoot?.querySelector<HTMLButtonElement>(
		'button[data-action="cancel"]',
	);
	expect(cancel?.getAttribute("data-variant")).toBe("quiet");
	expect(cancel?.type).toBe("button");
	cancel?.click();

	expect(cancelled).toHaveLength(1);
});

test("leaves the confirmation to the page, keeping no answer line of its own", async () => {
	const element = await mount();
	const add: Event[] = [];
	element.addEventListener("add", (event) => add.push(event));

	fill(element, "amount", "100");
	submit(element);
	await element.updateComplete;

	expect(add).toHaveLength(1);
	expect(element.shadowRoot?.querySelector(".answer")).toBeNull();
	// No reset: the page closes the dialog on success, and a failed save keeps the typing.
	expect(
		element.shadowRoot?.querySelector<HTMLInputElement>('[name="amount"]')
			?.value,
	).toBe("100");
});

test("names each option by card id and card name", async () => {
	const element = await mount();
	const option = element.shadowRoot?.querySelector<HTMLOptionElement>(
		'[name="cardId"] option',
	);
	expect(option?.value).toBe("kbank");
	expect(option?.textContent).toContain("kbank");
	expect(option?.textContent).toContain("KBank Visa");
});

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

test("renders its labels and submit button in the chosen language", async () => {
	setLocale("en");
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Add purchase");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("เพิ่มรายการ");
});

test("shows its validation failures in the chosen language", async () => {
	setLocale("th");
	const element = await mount();
	fill(element, "amount", "free");
	submit(element);
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain(
		"กรอกจำนวนเงินเป็นบาท เช่น 1234.56",
	);
});

test("re-renders a displayed error in the new language when the locale switches", async () => {
	setLocale("en");
	const element = await mount();

	fill(element, "amount", "free");
	submit(element);
	await element.updateComplete;

	expect(element.shadowRoot?.textContent).toContain(
		"Enter the amount in baht, like 1234.56.",
	);

	setLocale("th");
	await element.updateComplete;

	expect(element.shadowRoot?.textContent).toContain(
		"กรอกจำนวนเงินเป็นบาท เช่น 1234.56",
	);
	expect(element.shadowRoot?.textContent).not.toContain(
		"Enter the amount in baht, like 1234.56.",
	);
});

test("shows what is left on the selected card", async () => {
	const element = await mount();
	element.rows = [spendRow];
	await element.updateComplete;
	const note = element.shadowRoot?.querySelector('[data-testid="available"]');
	expect(note?.textContent).toContain("฿3,000.00");
	expect(note?.textContent).toContain("฿5,000.00");
});

test("follows the selection to another card's remaining credit", async () => {
	const element = await mount();
	element.cards = [cards[0] as Card, otherCard];
	element.rows = [spendRow, otherRow];
	await element.updateComplete;

	const select =
		element.shadowRoot?.querySelector<HTMLSelectElement>('[name="cardId"]');
	if (!select) throw new Error("no card select");
	select.value = "scb";
	select.dispatchEvent(new Event("change", { bubbles: true }));
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector('[data-testid="available"]')?.textContent,
	).toContain("฿1,000.00");
});

test("says nothing about credit when the card has no limit group", async () => {
	const element = await mount();
	element.rows = [];
	await element.updateComplete;
	expect(
		element.shadowRoot?.querySelector('[data-testid="available"]'),
	).toBeNull();
});

test("keeps the note and the select in agreement when the selected card drops out of the list", async () => {
	const element = await mount();
	element.cards = [cards[0] as Card, otherCard];
	element.rows = [spendRow, otherRow];
	await element.updateComplete;

	const select =
		element.shadowRoot?.querySelector<HTMLSelectElement>('[name="cardId"]');
	if (!select) throw new Error("no card select");
	select.value = "scb";
	select.dispatchEvent(new Event("change", { bubbles: true }));
	await element.updateComplete;

	// otherCard ("scb") drops out, replaced at the same array position by thirdCard ("ktb").
	// An unkeyed option list reuses that DOM node in place, so without a fix the browser's
	// native selection can silently keep pointing at what is now "ktb" -- no change event
	// fires -- while the tracked state still says "scb".
	element.cards = [cards[0] as Card, thirdCard];
	element.rows = [spendRow];
	await element.updateComplete;

	const selectAfter =
		element.shadowRoot?.querySelector<HTMLSelectElement>('[name="cardId"]');
	const note = element.shadowRoot?.querySelector('[data-testid="available"]');
	expect(selectAfter?.value).toBe("kbank");
	expect(note?.textContent).toContain("฿3,000.00");
	expect(note?.textContent).toContain("฿5,000.00");
});
