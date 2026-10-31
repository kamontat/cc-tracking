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

const mount = async (
	value: NeedsItem[],
	cards: Card[] = [],
	today = "2026-10-31",
) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-needs-you") as CcNeedsYou;
	element.items = value;
	element.cards = cards;
	element.today = today;
	document.body.append(element);
	await element.updateComplete;
	return element.shadowRoot as ShadowRoot;
};

const text = (root: ParentNode, selector: string) =>
	root.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();

const planned = (date: string): NeedsItem => ({
	kind: "planned",
	payment: {
		id: "c1",
		cardId: "SCB/K",
		date,
		amount: 5_000_00,
		status: "planned",
	},
	card,
});

const slots = (row: Element) => ({
	title: text(row, ".a-title"),
	subtitle: text(row, ".a-subtitle"),
	badge: text(row, ".a-badge"),
});

test("each item opens its task", async () => {
	const root = await mount(
		[...items(), planned("2026-11-02")],
		[],
		"2026-10-31",
	);
	const found = [...root.querySelectorAll("[data-item]")];
	expect(found.map((e) => e.getAttribute("data-item"))).toEqual([
		"waiting",
		"overdue",
		"draft",
		"planned",
	]);
	expect(found.map((e) => e.getAttribute("href"))).toEqual([
		"/list/reply?id=w1",
		"/pay?card=SCB%2FK&amount=4123000",
		"/list/draft?id=d1",
		"/transactions",
	]);
});

test("each kind fills the row's title, subtitle and badge, with no figure or button", async () => {
	const root = await mount(
		[...items(), planned("2026-11-02")],
		[{ ...card, id: "KB-S", name: "KBank S" }],
		"2026-10-31",
	);
	const [waiting, overdue, draft, plan] = [
		...root.querySelectorAll(".a-row"),
	] as Element[];
	expect(slots(waiting as Element)).toEqual({
		title: "Waiting on list for 30 Oct 2026",
		subtitle: "A) —, B) —, C) — · ฿3.00",
		badge: "Purchase list",
	});
	expect(slots(overdue as Element)).toEqual({
		title: "Overdue: SCB K (1111), due 16 days ago",
		subtitle: "฿41,230.00",
		badge: "Payment",
	});
	expect(slots(draft as Element)).toEqual({
		title: "Draft list for 30 Oct 2026",
		subtitle: "KB-S) KBank S, KS-K) — · ฿2.00",
		badge: "Purchase list",
	});
	expect(slots(plan as Element)).toEqual({
		title: "Planned: pay SCB K (1111) in 2 days",
		subtitle: "฿5,000.00",
		badge: "Payment",
	});
	expect(root.querySelector(".a-right")).toBeNull();
	expect(root.querySelector(".a-row button")).toBeNull();
	// The icon says the kind; no card chip besides (DD-106).
	for (const row of root.querySelectorAll("[data-item]")) {
		expect(row.querySelector(".a-ic .icon")).not.toBeNull();
		expect(row.querySelector(".mini")).toBeNull();
	}
	expect(
		root.querySelector('.a-ic[data-kind="draft"]')?.innerHTML,
	).toBeTruthy();
});

test("more than three cards read as a count", async () => {
	const root = await mount([
		{
			kind: "waiting",
			list: list("w1", "sent", ["A", "B", "C", "D"]),
			total: 400,
		},
	]);
	expect(text(root, ".a-subtitle")).toBe("4 cards · ฿4.00");
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
	expect(text(root, '[data-item="waiting"] .a-title')).toBe(
		"รอคำตอบใบรายการซื้อวันที่ 30 ต.ค. 2026",
	);
	expect(text(root, '[data-item="waiting"] .a-badge')).toBe("ใบรายการซื้อ");
	expect(text(root, '[data-item="overdue"] .a-title')).toBe(
		"เลยกำหนด: SCB K (1111) ครบกำหนดเมื่อ 16 วันที่แล้ว",
	);
});

test("one day overdue reads in the singular", async () => {
	const root = await mount([
		{ kind: "overdue", card, remaining: 100, dueDate: "2026-10-30", days: 1 },
	]);
	expect(text(root, '[data-item="overdue"] .a-title')).toBe(
		"Overdue: SCB K (1111), due 1 day ago",
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

test("a planned payment says how far off it is, and a past plan says how long ago", async () => {
	const title = async (date: string) =>
		text(await mount([planned(date)], [], "2026-10-31"), ".a-title");
	expect(await title("2026-10-31")).toBe("Planned: pay SCB K (1111) today");
	expect(await title("2026-11-01")).toBe("Planned: pay SCB K (1111) tomorrow");
	expect(await title("2026-11-03")).toBe("Planned: pay SCB K (1111) in 3 days");
	expect(await title("2026-10-30")).toBe("Planned: pay SCB K (1111) 1 day ago");
	expect(await title("2026-10-28")).toBe(
		"Planned: pay SCB K (1111) 3 days ago",
	);
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
