import { afterEach, expect, test } from "bun:test";
import "#components/cc-needs-you";
import type { CcNeedsYou } from "#components/cc-needs-you";
import type { NeedsItem } from "#lib/domain/home";
import type { Card, PurchaseList } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const card: Card = {
	id: "SCB/K",
	name: "SCB K",
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const list = (
	id: string,
	status: PurchaseList["status"],
	cards: string[],
): PurchaseList => ({
	id,
	date: "2026-10-30",
	status,
	lines: cards.map((cardId) => ({ cardId, amount: 100 })),
});

const items = (): NeedsItem[] => [
	{
		kind: "waiting",
		list: list("w1", "sent", ["A", "B", "C"]),
		total: 39_300_00,
	},
	{
		kind: "overdue",
		card,
		remaining: 41_230_00,
		dueDate: "2026-10-15",
		days: 16,
	},
	{
		kind: "draft",
		list: list("d1", "draft", ["KB-S", "KS-K"]),
		total: 5_000_00,
	},
];

const mount = async (value: NeedsItem[], cards: Card[] = []) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-needs-you") as CcNeedsYou;
	element.items = value;
	element.cards = cards;
	document.body.append(element);
	await element.updateComplete;
	return element.shadowRoot as ShadowRoot;
};

const text = (root: ParentNode, selector: string) =>
	root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();

test("each item opens its task", async () => {
	const root = await mount(items(), [{ ...card, id: "KB-S", name: "KBank S" }]);
	const found = [...root.querySelectorAll("[data-item]")];
	expect(found.map((e) => e.getAttribute("data-item"))).toEqual([
		"waiting",
		"overdue",
		"draft",
	]);
	expect(found.map((e) => e.getAttribute("href"))).toEqual([
		"/list/reply?id=w1",
		"/pay?card=SCB%2FK&amount=4123000",
		"/list/draft?id=d1",
	]);
	expect(text(found[0] as Element, "small")).toBe(
		"List for Fri, 30 Oct · 3 cards · ฿39,300.00",
	);
	expect(text(found[1] as Element, "b")).toBe(
		"Bill for SCB/K) SCB K is 16 days overdue",
	);
	expect(
		text(found[2] as Element, "small")?.startsWith("KB-S) KBank S, KS-K) — · "),
	).toBe(true);
});

test("the heading counts", async () => {
	expect(text(await mount(items().slice(0, 1)), "h1")).toBe(
		"1 thing needs you",
	);
	expect(text(await mount(items()), "h1")).toBe("3 things need you");
});

test("a quiet day is all caught up", async () => {
	const root = await mount([]);
	expect(text(root, "h1")).toBe("All caught up");
	expect(root.querySelector("[data-item]")).toBeNull();
	expect(root.querySelector('p.note[data-tone="ok"]')).not.toBeNull();
});

test("reads in Thai", async () => {
	setLocale("th");
	const root = await mount(items());
	expect(text(root, "h1")).toBe("มี 3 เรื่องรอคุณ");
	expect(text(root, '[data-item="waiting"] b')).toBe("รอคำตอบของผู้ใช้บัตร");
});

test("one card and one day read in the singular", async () => {
	const root = await mount([
		{ kind: "waiting", list: list("w1", "sent", ["A"]), total: 100 },
		{
			kind: "overdue",
			card,
			remaining: 100,
			dueDate: "2026-10-30",
			days: 1,
		},
	]);
	expect(text(root, '[data-item="waiting"] small')).toBe(
		"List for Fri, 30 Oct · 1 card · ฿1.00",
	);
	expect(text(root, '[data-item="overdue"] b')).toBe(
		"Bill for SCB/K) SCB K is 1 day overdue",
	);
	const many = await mount([
		{ kind: "waiting", list: list("w1", "sent", ["A", "B"]), total: 100 },
		{ kind: "overdue", card, remaining: 100, dueDate: "2026-10-29", days: 2 },
	]);
	expect(text(many, '[data-item="waiting"] small')).toBe(
		"List for Fri, 30 Oct · 2 cards · ฿1.00",
	);
	expect(text(many, '[data-item="overdue"] b')).toBe(
		"Bill for SCB/K) SCB K is 2 days overdue",
	);
});

test("a list id is encoded in its link", async () => {
	const root = await mount([
		{ kind: "waiting", list: list("w 1/2", "sent", ["A"]), total: 100 },
		{ kind: "draft", list: list("d&1", "draft", ["A"]), total: 100 },
	]);
	expect(
		[...root.querySelectorAll("[data-item]")].map((e) =>
			e.getAttribute("href"),
		),
	).toEqual(["/list/reply?id=w%201%2F2", "/list/draft?id=d%261"]);
});

test("a planned payment row says what to do and opens Transactions", async () => {
	const root = await mount([
		{
			kind: "planned",
			payment: {
				id: "c1",
				cardId: "SCB/K",
				date: "2026-11-02",
				amount: 5_000_00,
				status: "planned",
			},
			card,
		},
	]);
	const row = root.querySelector('[data-item="planned"]') as Element;
	expect(row.getAttribute("href")).toBe("/transactions");
	expect(text(row, "b")).toBe("Planned: pay SCB/K) SCB K on Mon, 02 Nov");
	expect(text(row, "small")).toBe("฿5,000.00 · mark it paid when it goes out");
});

test("a row with a type icon shows no card chip as well", async () => {
	const root = await mount([
		...items(),
		{
			kind: "planned",
			payment: {
				id: "c1",
				cardId: "SCB/K",
				date: "2026-11-02",
				amount: 5_000_00,
				status: "planned",
			},
			card,
		},
	]);
	for (const row of root.querySelectorAll("[data-item]")) {
		expect(row.querySelector(".chip .icon")).not.toBeNull();
		expect(row.querySelector(".mini")).toBeNull();
	}
});

const many = (count: number): NeedsItem[] =>
	Array.from({ length: count }, (_, i) => ({
		kind: "waiting" as const,
		list: list(`w${i}`, "sent", ["A"]),
		total: 100,
	}));

const shown = (root: ShadowRoot) =>
	[...root.querySelectorAll("[data-item]")].map((e) => e.getAttribute("href"));

test("five or fewer things show in full, with no See more", async () => {
	const root = await mount(many(5));
	expect(shown(root)).toHaveLength(5);
	expect(root.querySelector('[data-action="more"]')).toBeNull();
});

test("more than five show the first five and See more expands the rest in place, in order", async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-needs-you") as CcNeedsYou;
	element.items = many(8);
	document.body.append(element);
	await element.updateComplete;
	const root = element.shadowRoot as ShadowRoot;
	expect(text(root, "h1")).toBe("8 things need you");
	expect(shown(root)).toEqual(
		[0, 1, 2, 3, 4].map((i) => `/list/reply?id=w${i}`),
	);
	const more = root.querySelector<HTMLButtonElement>('[data-action="more"]');
	expect(more?.getAttribute("type")).toBe("button");
	expect(more?.getAttribute("data-variant")).toBe("quiet");
	expect(more?.getAttribute("aria-expanded")).toBe("false");
	expect(more?.textContent?.trim()).toBe("See more (3)");
	more?.click();
	await element.updateComplete;
	expect(shown(root)).toEqual(
		[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `/list/reply?id=w${i}`),
	);
	const less = root.querySelector<HTMLButtonElement>('[data-action="more"]');
	expect(less?.getAttribute("aria-expanded")).toBe("true");
	expect(less?.textContent?.trim()).toBe("Show less");
	less?.click();
	await element.updateComplete;
	expect(shown(root)).toHaveLength(5);
});

test("See more reads in Thai", async () => {
	setLocale("th");
	const root = await mount(many(7));
	expect(text(root, '[data-action="more"]')).toBe("ดูเพิ่ม (2)");
});
