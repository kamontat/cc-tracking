import { expect, test } from "bun:test";
import "#components/cc-quick-add";
import type { SpendRow } from "#lib/domain/limit";
import type { Card, Purchase } from "#lib/domain/types";
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

test("names its only card as a plain field rather than a one-option picker", async () => {
	const element = await mount();
	let detail: { cardId: string } | undefined;
	element.addEventListener("add", (event) => {
		detail = (event as CustomEvent<typeof detail>).detail;
	});

	expect(element.shadowRoot?.querySelector('[name="cardId"]')).toBeNull();
	const field = element.shadowRoot?.querySelector('[data-field="card"]');
	expect(field?.textContent).toContain("Card");
	expect(field?.textContent).toContain("kbank — KBank Visa");

	fill(element, "amount", "100");
	submit(element);
	expect(detail?.cardId).toBe("kbank");
});

test("names each option by card id and card name", async () => {
	const element = await mount();
	element.cards = [cards[0] as Card, otherCard];
	await element.updateComplete;
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

test("warns about a future-dated purchase but still adds it", async () => {
	const element = await mount();
	const futureWarning = () =>
		element.shadowRoot?.querySelector('[data-testid="future-date-warning"]');
	expect(futureWarning()).toBeNull();
	let detail: { date: string } | undefined;
	element.addEventListener("add", (event) => {
		detail = (event as CustomEvent<{ date: string }>).detail;
	});

	fill(element, "date", "2026-09-22");
	await element.updateComplete;
	expect(futureWarning()?.textContent).toContain("future");

	fill(element, "amount", "100");
	submit(element);
	await element.updateComplete;

	expect(detail?.date).toBe("2026-09-22");
	expect(element.shadowRoot?.querySelector('[role="alert"]')).toBeNull();
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

const warning = (element: HTMLElement) =>
	element.shadowRoot?.querySelector('[data-testid="close-date-warning"]');

test("warns, without refusing, when the date is the card's statement close date", async () => {
	const element = await mount();
	expect(warning(element)).toBeNull();

	fill(element, "date", "2026-09-18");
	await element.updateComplete;
	expect(warning(element)?.textContent).toContain("statement closes");

	let added = false;
	element.addEventListener("add", () => {
		added = true;
	});
	fill(element, "amount", "100");
	submit(element);
	expect(added).toBe(true);

	fill(element, "date", "2026-09-19");
	await element.updateComplete;
	expect(warning(element)).toBeNull();
});

test("checks the close date against the selected card's own cycle", async () => {
	const element = await mount();
	element.cards = [
		...cards,
		{
			...otherCard,
			cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 15 },
		},
	];
	await element.updateComplete;
	fill(element, "date", "2026-08-25");
	await element.updateComplete;
	expect(warning(element)).toBeNull();

	const select =
		element.shadowRoot?.querySelector<HTMLSelectElement>('[name="cardId"]');
	if (!select) throw new Error("no card picker");
	select.value = "scb";
	select.dispatchEvent(new Event("change"));
	await element.updateComplete;
	expect(warning(element)).not.toBeNull();
});

test("warns about the close date in the chosen language", async () => {
	setLocale("th");
	try {
		const element = await mount();
		fill(element, "date", "2026-09-18");
		await element.updateComplete;
		expect(warning(element)?.textContent).toContain("วันตัดรอบบัญชี");
	} finally {
		setLocale("en");
	}
});

const existing: Purchase = {
	id: "p1",
	cardId: "kbank",
	date: "2026-09-05",
	amount: 123_450,
	note: "fuel",
};

const mountEditing = async () => {
	const element = await mount();
	element.purchase = existing;
	await element.updateComplete;
	return element;
};

const field = (element: HTMLElement, name: string) =>
	element.shadowRoot?.querySelector<HTMLInputElement>(`[name="${name}"]`)
		?.value;

test("fills its fields from the purchase being edited", async () => {
	const element = await mountEditing();
	expect(field(element, "date")).toBe("2026-09-05");
	expect(field(element, "amount")).toBe("1234.50");
	expect(field(element, "note")).toBe("fuel");
	expect(
		element.shadowRoot?.querySelector('button[type="submit"]')?.textContent,
	).toBe("Save changes");
});

test("emits the edited purchase with its own id and card", async () => {
	const element = await mountEditing();
	let detail: unknown;
	element.addEventListener("add", (event) => {
		detail = (event as CustomEvent).detail;
	});

	fill(element, "date", "2026-09-10");
	fill(element, "amount", "99");
	fill(element, "note", "parts");
	submit(element);

	expect(detail).toEqual({
		id: "p1",
		cardId: "kbank",
		date: "2026-09-10",
		amount: 9_900,
		note: "parts",
	});
});

test("still refuses a bad amount while editing", async () => {
	const element = await mountEditing();
	let added = false;
	element.addEventListener("add", () => {
		added = true;
	});
	fill(element, "amount", "abc");
	submit(element);
	await element.updateComplete;
	expect(added).toBe(false);
	expect(element.shadowRoot?.querySelector('[role="alert"]')).not.toBeNull();
});

const mountInline = async () => {
	const element = await mount();
	element.inline = true;
	element.cards = [...cards, otherCard];
	await element.updateComplete;
	return element;
};

test("inline form has no cancel button", async () => {
	const element = await mountInline();
	expect(
		element.shadowRoot?.querySelector('[data-action="cancel"]'),
	).toBeNull();
});

test("bumping cleared empties amount and note but keeps card and date", async () => {
	const element = await mountInline();
	const select =
		element.shadowRoot?.querySelector<HTMLSelectElement>('[name="cardId"]');
	if (!select) throw new Error("no card picker");
	select.value = "scb";
	select.dispatchEvent(new Event("change"));
	fill(element, "date", "2026-09-20");
	fill(element, "amount", "120.50");
	fill(element, "note", "taxi");
	await element.updateComplete;

	element.cleared = 1;
	await element.updateComplete;

	expect(field(element, "amount")).toBe("");
	expect(field(element, "note")).toBe("");
	expect(field(element, "cardId")).toBe("scb");
	expect(field(element, "date")).toBe("2026-09-20");
	expect(
		(element.shadowRoot?.activeElement as HTMLInputElement | null)?.name,
	).toBe("amount");
});

test("a new day keeps a date the reader picked", async () => {
	const element = await mountInline();
	fill(element, "date", "2026-09-15");
	await element.updateComplete;
	element.today = "2026-09-22";
	await element.updateComplete;
	expect(field(element, "date")).toBe("2026-09-15");
});

test("a new day moves a date still on the old today", async () => {
	const element = await mountInline();
	expect(field(element, "date")).toBe("2026-09-21");
	element.today = "2026-09-22";
	await element.updateComplete;
	expect(field(element, "date")).toBe("2026-09-22");
});

test("without a cleared bump the typing stays after an add", async () => {
	const element = await mountInline();
	fill(element, "amount", "120.50");
	fill(element, "note", "taxi");
	submit(element);
	await element.updateComplete;
	expect(field(element, "amount")).toBe("120.50");
	expect(field(element, "note")).toBe("taxi");
});
