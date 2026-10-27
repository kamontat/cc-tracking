import { expect, test } from "bun:test";
import "#components/cc-sitting-list";
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

const NOW = Date.parse("2026-10-27T05:00:00.000Z");
const minutesAgo = (minutes: number) =>
	new Date(NOW - minutes * 60_000).toISOString();

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
	id: "p1",
	cardId: "kbank",
	date: "2026-10-20",
	amount: 125_000,
	note: "hotel",
	addedAt: minutesAgo(5),
	...overrides,
});

const mount = async (purchases: Purchase[]) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-sitting-list");
	element.purchases = purchases;
	element.cards = [card];
	element.now = NOW;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const q = (element: HTMLElement, selector: string) =>
	element.shadowRoot?.querySelector<HTMLElement>(selector) ?? null;
const rows = (element: HTMLElement) => [
	...(element.shadowRoot?.querySelectorAll<HTMLElement>(
		'[data-testid="sitting-row"]',
	) ?? []),
];
const click = async (element: HTMLElement, selector: string) => {
	q(element, selector)?.click();
	await (element as HTMLElement & { updateComplete: Promise<unknown> })
		.updateComplete;
};

test("lists the purchases in the order given, with added, card, date and amount only", async () => {
	const element = await mount([
		purchase({ id: "b", note: "taxi", amount: 48_000, date: "2026-10-21" }),
		purchase({ id: "a", note: "hotel" }),
	]);
	const listed = rows(element);
	expect(listed).toHaveLength(2);
	expect(
		[...(listed[0]?.querySelectorAll("td") ?? [])].map((cell) =>
			cell.textContent?.replace(/\s+/g, " ").trim(),
		),
	).toEqual(["5 min ago", "kbank) KBank Visa", "21 Oct 2026", "฿480.00"]);
	expect(listed[0]?.textContent).not.toContain("taxi");
	expect(
		[...(element.shadowRoot?.querySelectorAll("th") ?? [])].map((cell) =>
			cell.textContent?.trim(),
		),
	).toEqual(["Added", "Card", "Bought", "Amount"]);
});

test("names the card as the other panels do, without a link", async () => {
	const element = await mount([purchase()]);
	const row = rows(element)[0];
	expect(row?.querySelector(".card-id")?.textContent).toBe("kbank)");
	expect(row?.querySelector(".card-name")?.textContent).toBe("KBank Visa");
	expect(row?.querySelector("a")).toBeNull();
});

test("sums up how many were added and their total", async () => {
	const element = await mount([
		purchase({ id: "a", amount: 125_000 }),
		purchase({ id: "b", amount: 48_000 }),
	]);
	expect(q(element, '[data-testid="sitting-summary"]')?.textContent).toContain(
		"2 added",
	);
	expect(q(element, '[data-testid="sitting-summary"]')?.textContent).toContain(
		"1,730",
	);
});

test("says so when nothing has been added yet", async () => {
	const element = await mount([]);
	expect(rows(element)).toHaveLength(0);
	expect(element.shadowRoot?.textContent).toContain(
		"Nothing added since this batch started.",
	);
});

test("says how long ago each was entered", async () => {
	const element = await mount([
		purchase({ id: "a", addedAt: new Date(NOW - 30_000).toISOString() }),
		purchase({ id: "b", addedAt: minutesAgo(5) }),
		purchase({ id: "c", addedAt: minutesAgo(3 * 60) }),
		purchase({ id: "d", addedAt: minutesAgo(2 * 24 * 60) }),
	]);
	const ago = rows(element).map(
		(row) => row.querySelector('[data-testid="sitting-ago"]')?.textContent,
	);
	expect(ago).toEqual(["just now", "5 min ago", "3 h ago", "2 d ago"]);
});

test("names a card that is gone by its id", async () => {
	const element = await mount([purchase({ cardId: "gone" })]);
	expect(rows(element)[0]?.textContent).toContain("gone");
});

test("rows carry no actions", async () => {
	const element = await mount([purchase()]);
	expect(rows(element)[0]?.querySelector("button")).toBeNull();
});

test("starting a new batch asks first, and Keep backs out without an event", async () => {
	const element = await mount([purchase()]);
	let started = 0;
	element.addEventListener("start-batch", () => {
		started += 1;
	});

	await click(element, '[data-action="start-batch"]');
	expect(q(element, '[data-action="confirm-batch"]')).not.toBeNull();
	expect(q(element, '[data-action="keep-batch"]')).not.toBeNull();
	expect(started).toBe(0);

	await click(element, '[data-action="keep-batch"]');
	expect(q(element, '[data-action="start-batch"]')).not.toBeNull();
	expect(q(element, '[data-action="confirm-batch"]')).toBeNull();
	expect(started).toBe(0);
});

test("confirming starts a new batch once", async () => {
	const element = await mount([purchase()]);
	let started = 0;
	element.addEventListener("start-batch", () => {
		started += 1;
	});
	await click(element, '[data-action="start-batch"]');
	await click(element, '[data-action="confirm-batch"]');
	expect(started).toBe(1);
	expect(q(element, '[data-action="start-batch"]')).not.toBeNull();
});

test("follows the chosen language", async () => {
	setLocale("th");
	try {
		const element = await mount([purchase()]);
		expect(
			rows(element)[0]?.querySelector('[data-testid="sitting-ago"]')
				?.textContent,
		).toBe("5 นาทีที่แล้ว");
	} finally {
		setLocale("en");
	}
});
