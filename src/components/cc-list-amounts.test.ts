import { afterEach, expect, test } from "bun:test";
import "#components/cc-list-amounts";
import type { CcListAmounts } from "#components/cc-list-amounts";
import type { GroupRoom } from "#lib/domain/room";
import type { Card, CardLedger, LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const card = (id: string, limitGroupId: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId,
});

const g1: LimitGroup = { id: "g1", name: "Group one", limit: 100_000_00 };
const g2: LimitGroup = { id: "g2", name: "Group two", limit: 10_000_00 };

const room = (group: LimitGroup, value: number, held = 0): GroupRoom => ({
	group,
	used: 0,
	available: value + held,
	held,
	room: value,
	level: "within",
	sharedWith: 0,
});

const emptyLedger = (): CardLedger => ({ statements: [], owed: 0, credit: 0 });

const overdueLedger = (): CardLedger => ({
	statements: [
		{
			cardId: "A",
			period: "2026-09",
			closeDate: "2026-09-18",
			dueDate: "2026-10-03",
			purchases: [],
			total: 5_000_00,
			paidAmount: 0,
			remaining: 5_000_00,
			paid: false,
			open: false,
		},
	],
	owed: 5_000_00,
	credit: 0,
});

const A = card("A", "g1");
const B = card("B", "g1");
const C = card("C", "g2");

const mount = async (
	props: Partial<CcListAmounts> = {},
	opts: { heldA?: number; ledgerA?: CardLedger } = {},
) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-list-amounts") as CcListAmounts;
	const r1 = room(g1, 50_000_00, opts.heldA ?? 0);
	Object.assign(element, {
		cards: [A, B, C],
		candidates: [],
		rooms: new Map([
			["A", r1],
			["B", r1],
			["C", room(g2, 0)],
		]),
		ledgers: new Map([
			["A", opts.ledgerA ?? emptyLedger()],
			["B", emptyLedger()],
			["C", emptyLedger()],
		]),
		today: "2026-10-31",
		date: "2026-10-31",
		entries: {},
		...props,
	});
	document.body.append(element);
	await element.updateComplete;
	return { element, root: element.shadowRoot as ShadowRoot };
};

const flat = (el: Element | ParentNode | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const line = (root: ParentNode, id: string) =>
	root.querySelector(`section.line[data-card="${id}"]`) as HTMLElement;
const amountInput = (root: ParentNode, id: string) =>
	line(root, id).querySelector('[data-field="amount"]') as HTMLInputElement;
const dateInput = (root: ParentNode) =>
	root.querySelector('[data-field="date"]') as HTMLInputElement;
const reviewButton = (root: ParentNode) =>
	root.querySelector('[data-action="review"]') as HTMLButtonElement;
const footer = (root: ParentNode) => root.querySelector(".action-bar");

const type = async (
	element: CcListAmounts,
	root: ParentNode,
	id: string,
	text: string,
) => {
	const input = amountInput(root, id);
	input.value = text;
	input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
	await element.updateComplete;
};

const setDate = async (element: CcListAmounts, value: string) => {
	const input = dateInput(element.shadowRoot as ShadowRoot);
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
	await element.updateComplete;
};

const listen = <T>(element: HTMLElement, name: string) => {
	const seen: T[] = [];
	element.addEventListener(name, (e) =>
		seen.push((e as CustomEvent<T>).detail),
	);
	return seen;
};

test("typing shows room after and the total", async () => {
	const { element, root } = await mount();
	const changes = listen<{ entries: Record<string, string> }>(
		element,
		"entry-change",
	);
	await type(element, root, "A", "20,000");
	expect(flat(line(root, "A").querySelector(".after"))).toContain("฿30,000.00");
	expect(flat(footer(root))).toContain("฿20,000.00");
	expect(changes.at(-1)?.entries["A"]).toBe("20,000");
});

test("over the room offers lower to", async () => {
	const { element, root } = await mount();
	await type(element, root, "A", "60000");
	const warning = line(root, "A").querySelector('[data-warning="over-room"]');
	expect(flat(warning)).toContain("฿10,000.00");
	const lower = line(root, "A").querySelector(
		'[data-action="lower"]',
	) as HTMLButtonElement;
	expect(flat(lower)).toBe("Lower to ฿50,000.00");
	lower.click();
	await element.updateComplete;
	expect(amountInput(root, "A").value).toBe("50000");
	expect(line(root, "A").querySelector("[data-warning]")).toBeNull();
	expect(line(root, "A").hasAttribute("data-warn")).toBe(false);
});

test("held room is explained", async () => {
	let { element, root } = await mount({}, { heldA: 10_000_00 });
	await type(element, root, "A", "60000");
	expect(
		flat(line(root, "A").querySelector('[data-warning="over-room"]')),
	).toContain("held by lists waiting for the spender");

	({ element, root } = await mount({}, { heldA: 0 }));
	await type(element, root, "A", "60000");
	expect(
		flat(line(root, "A").querySelector('[data-warning="over-room"]')),
	).not.toContain("held by lists waiting for the spender");
});

test("no lower to when the room is gone", async () => {
	const { element, root } = await mount();
	await type(element, root, "C", "100");
	expect(
		line(root, "C").querySelector('[data-warning="over-room"]'),
	).not.toBeNull();
	expect(line(root, "C").querySelector('[data-action="lower"]')).toBeNull();
});

test("cards sharing a limit are warned together", async () => {
	const { element, root } = await mount();
	await type(element, root, "A", "30000");
	await type(element, root, "B", "30000");
	for (const id of ["A", "B"]) {
		const warning = line(root, id).querySelector(
			'[data-warning="shared-limit"]',
		);
		expect(flat(warning)).toContain("A, B");
	}
});

test("an overdue bill links to the card", async () => {
	const { root } = await mount({}, { ledgerA: overdueLedger() });
	const link = line(root, "A").querySelector(
		'[data-warning="overdue-bill"] a',
	) as HTMLAnchorElement;
	expect(link.getAttribute("href")).toBe("/card?id=A");
});

test("buying on the close date is warned", async () => {
	const { element, root } = await mount();
	await setDate(element, "2026-11-18");
	expect(
		line(root, "A").querySelector('[data-warning="close-date"]'),
	).not.toBeNull();
});

test("a past date is warned once, with change to today", async () => {
	const { element, root } = await mount({ date: "2026-10-30" });
	expect(root.querySelectorAll('[data-warning="date-passed"]').length).toBe(1);
	expect(flat(footer(root))).toContain("date has passed");
	(root.querySelector('[data-action="to-today"]') as HTMLButtonElement).click();
	await element.updateComplete;
	expect(dateInput(root).value).toBe("2026-10-31");
	expect(root.querySelector('[data-warning="date-passed"]')).toBeNull();
});

test("the summary counts lines with warnings", async () => {
	const { element, root } = await mount();
	await type(element, root, "A", "60000");
	await type(element, root, "C", "100");
	expect(flat(footer(root))).toContain("2 lines have warnings");
});

test("amounts that are not money stop review", async () => {
	const { element, root } = await mount();
	expect(reviewButton(root).disabled).toBe(true);
	await type(element, root, "A", "12.345");
	expect(flat(line(root, "A"))).toContain(
		"Enter the amount in baht, like 1234.56.",
	);
	expect(flat(line(root, "A").querySelector(".after"))).toContain("—");
	expect(flat(footer(root))).not.toContain("NaN");
	expect(reviewButton(root).disabled).toBe(true);
	await type(element, root, "A", "");
	expect(reviewButton(root).disabled).toBe(true);
	await type(element, root, "A", "100");
	expect(reviewButton(root).disabled).toBe(false);
});

test("review sends the filled lines", async () => {
	const { element, root } = await mount();
	const reviews = listen(element, "review");
	await type(element, root, "A", "100");
	reviewButton(root).click();
	expect(reviews).toEqual([
		{ date: "2026-10-31", lines: [{ cardId: "A", amount: 10000 }] },
	]);
});

test("remove and add", async () => {
	const { element, root } = await mount({ cards: [A, B], candidates: [C] });
	const removes = listen(element, "remove");
	const adds = listen(element, "add");
	(
		line(root, "A").querySelector('[data-action="remove"]') as HTMLButtonElement
	).click();
	expect(removes).toEqual([{ cardId: "A" }]);
	expect(root.querySelector(".picker")).toBeNull();
	(root.querySelector('[data-action="add-card"]') as HTMLButtonElement).click();
	await element.updateComplete;
	const pick = root.querySelector(
		'.picker [data-card="C"]',
	) as HTMLButtonElement;
	expect(flat(pick)).toBe("C — Card C");
	pick.click();
	expect(adds).toEqual([{ cardId: "C" }]);
});

test("an empty list says so", async () => {
	const { root } = await mount({ cards: [] });
	expect(flat(root)).toContain("No cards on this list yet. Add one below.");
});

test("starting values and a language switch keep what was typed", async () => {
	const { element, root } = await mount({
		entries: { A: "123" },
		date: "2026-11-02",
	});
	expect(amountInput(root, "A").value).toBe("123");
	expect(dateInput(root).value).toBe("2026-11-02");
	await type(element, root, "B", "5");
	setLocale("th");
	await element.updateComplete;
	expect(amountInput(root, "A").value).toBe("123");
	expect(amountInput(root, "B").value).toBe("5");
	expect(flat(line(root, "A"))).toContain("วงเงินเหลือหลังซื้อ");
});

test("the total counts one card or many", async () => {
	expect(flat(footer((await mount({ cards: [A] })).root))).toContain(
		"Total · 1 card",
	);
	expect(flat(footer((await mount({ cards: [A, B] })).root))).toContain(
		"Total · 2 cards",
	);
});
