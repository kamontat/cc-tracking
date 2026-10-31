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

const mount = async (value: NeedsItem[]) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-needs-you") as CcNeedsYou;
	element.items = value;
	document.body.append(element);
	await element.updateComplete;
	return element.shadowRoot as ShadowRoot;
};

const text = (root: ParentNode, selector: string) =>
	root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();

test("each item opens its task", async () => {
	const root = await mount(items());
	const found = [...root.querySelectorAll("[data-item]")];
	expect(found.map((e) => e.getAttribute("data-item"))).toEqual([
		"waiting",
		"overdue",
		"draft",
	]);
	expect(found.map((e) => e.getAttribute("href"))).toEqual([
		"/list?id=w1",
		"/card?id=SCB%2FK",
		"/list?id=d1",
	]);
	expect(text(found[0] as Element, "small")).toBe(
		"List for Fri, 30 Oct · 3 cards · ฿39,300.00",
	);
	expect(text(found[1] as Element, "b")).toBe("SCB/K bill is 16 days overdue");
	expect(text(found[2] as Element, "small")?.startsWith("KB-S, KS-K · ")).toBe(
		true,
	);
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
