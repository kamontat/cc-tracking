import { expect, test } from "bun:test";
import "#components/cc-purchase-range";
import type { Card, Purchase } from "#lib/domain/types";

const card = (overrides: Partial<Card> = {}): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	...overrides,
});

const cards = [
	card(),
	card({ id: "old", name: "Old Amex", archived: true }),
	card({ id: "scb", name: "SCB Mastercard" }),
];

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
	id: "p",
	cardId: "kbank",
	date: "2026-10-10",
	amount: 10_000,
	note: "",
	...overrides,
});

const purchases = [
	purchase({ id: "a", date: "2026-10-02", amount: 10_000, note: "fuel" }),
	purchase({ id: "b", date: "2026-10-20", amount: 5_000, cardId: "scb" }),
	purchase({ id: "c", date: "2026-10-20", amount: 2_000, cardId: "old" }),
	purchase({ id: "d", date: "2026-09-15", amount: 40_000 }),
];

type RangeElement = HTMLElementTagNameMap["cc-purchase-range"];

const mount = async (list: Purchase[] = purchases) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-purchase-range");
	element.purchases = list;
	element.cards = cards;
	element.today = "2026-10-27";
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const q = <T extends HTMLElement = HTMLElement>(
	element: RangeElement,
	selector: string,
) => element.shadowRoot?.querySelector<T>(selector) ?? null;
const all = (element: RangeElement, selector: string) => [
	...(element.shadowRoot?.querySelectorAll<HTMLElement>(selector) ?? []),
];
const tile = (element: RangeElement, name: string) =>
	q(element, `[data-testid="range-${name}"]`)?.textContent?.trim();
const choosePreset = async (element: RangeElement, preset: string) => {
	q(element, `[data-preset="${preset}"]`)?.click();
	await element.updateComplete;
};
const setInput = async (element: RangeElement, name: string, value: string) => {
	const input = q<HTMLInputElement | HTMLSelectElement>(
		element,
		`[name="${name}"]`,
	);
	if (!input) throw new Error(`no field ${name}`);
	input.value = value;
	input.dispatchEvent(
		new Event(input.tagName === "SELECT" ? "change" : "input"),
	);
	await element.updateComplete;
};

test("starts on this month, across every card, archived included", async () => {
	const element = await mount();
	expect(
		q(element, '[data-preset="month"]')?.getAttribute("aria-pressed"),
	).toBe("true");
	expect(tile(element, "count")).toBe("3");
	expect(tile(element, "total")).toBe("฿170.00");
	expect(tile(element, "cards")).toBe("3");
});

test("last month moves the counts", async () => {
	const element = await mount();
	await choosePreset(element, "lastMonth");
	expect(tile(element, "count")).toBe("1");
	expect(tile(element, "total")).toBe("฿400.00");
});

test("custom starts from the range that was showing", async () => {
	const element = await mount();
	await choosePreset(element, "custom");
	expect(q<HTMLInputElement>(element, '[name="from"]')?.value).toBe(
		"2026-10-01",
	);
	expect(q<HTMLInputElement>(element, '[name="to"]')?.value).toBe("2026-10-31");
});

test("a custom range typed backwards still counts the purchases between", async () => {
	const element = await mount();
	await choosePreset(element, "custom");
	await setInput(element, "from", "2026-10-25");
	await setInput(element, "to", "2026-10-15");
	expect(tile(element, "count")).toBe("2");
});

test("clearing one end leaves that side open", async () => {
	const element = await mount();
	await choosePreset(element, "custom");
	await setInput(element, "to", "");
	await setInput(element, "from", "2026-09-01");
	expect(tile(element, "count")).toBe("4");
});

test("the card filter narrows it, and lists archived cards last", async () => {
	const element = await mount();
	const options = all(element, '[name="card"] option').map(
		(option) => (option as HTMLOptionElement).value,
	);
	expect(options).toEqual(["", "kbank", "scb", "old"]);
	expect(all(element, '[name="card"] option')[3]?.textContent).toContain(
		"archived",
	);
	await setInput(element, "card", "scb");
	expect(tile(element, "count")).toBe("1");
});

test("the list stays folded until opened, then groups by day, newest first", async () => {
	const element = await mount();
	const details = q<HTMLDetailsElement>(element, "details");
	expect(details?.open).toBe(false);
	expect(q(element, "summary")?.textContent).toContain("Show 3 purchases");
	const days = all(element, '[data-testid="range-day"]').map((day) =>
		day.textContent?.trim(),
	);
	expect(days).toEqual(["20 Oct 2026", "02 Oct 2026"]);
	expect(all(element, '[data-testid="range-row"]')).toHaveLength(3);
});

test("tags a purchase on an archived card", async () => {
	const element = await mount();
	const tagged = all(element, '[data-testid="range-row"]').filter((row) =>
		row.querySelector('[data-testid="archived-tag"]'),
	);
	expect(tagged).toHaveLength(1);
	expect(tagged[0]?.textContent).toContain("Old Amex");
});

test("names each card as the other panels do, linked to its page", async () => {
	const element = await mount([
		purchase({ cardId: "k b", date: "2026-10-05" }),
	]);
	element.cards = [card({ id: "k b", name: "KBank Visa" })];
	await element.updateComplete;
	const row = all(element, '[data-testid="range-row"]')[0];
	expect(row?.querySelector(".card-id")?.textContent).toBe("k b)");
	const link = row?.querySelector<HTMLAnchorElement>("a.card-name");
	expect(link?.textContent).toBe("KBank Visa");
	expect(link?.getAttribute("href")).toBe("/card?id=k%20b");
});

test("says so when the range is empty", async () => {
	const element = await mount([]);
	expect(tile(element, "count")).toBe("0");
	expect(element.shadowRoot?.textContent).toContain(
		"No purchases in this range.",
	);
});
