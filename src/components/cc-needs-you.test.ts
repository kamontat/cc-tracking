import { afterEach, expect, test } from "bun:test";
import "#components/cc-needs-you";
import type { CcNeedsYou } from "#components/cc-needs-you";
import type { NeedsItem } from "#lib/domain/home";
import type { Card, LimitGroup, PurchaseList } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const card: Card = {
	id: "SCB/K",
	name: "SCB K",
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "g1",
};

const { limitGroupId: _unused, ...noGroup } = card;

const groups: LimitGroup[] = [{ id: "g1", name: "SCB", limit: 1, owner: "RI" }];

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
	limitGroups: LimitGroup[] = groups,
) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-needs-you") as CcNeedsYou;
	element.items = value;
	element.cards = cards;
	element.groups = limitGroups;
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
	subtitle: text(row, ".a-sub"),
	amount: text(row, ".a-right .amount"),
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

test("each kind fills the row's title and subtitle, with the amount on the right and no badge or button", async () => {
	const root = await mount(
		[...items(), planned("2026-11-02")],
		[
			{ ...card, id: "KB-S", name: "KBank S" },
			{ ...noGroup, id: "KS-K", name: "KBank K" },
		],
		"2026-10-31",
	);
	const [waiting, overdue, draft, plan] = [
		...root.querySelectorAll(".a-row"),
	] as Element[];
	expect(slots(waiting as Element)).toEqual({
		title: "Waiting on list for 30 Oct 2026",
		subtitle: "c-[A], c-[B], c-[C]",
		amount: "−฿3.00",
	});
	expect(slots(overdue as Element)).toEqual({
		title: "Overdue: SCB K (RI)",
		subtitle: "for 16 days",
		amount: "฿41,230.00",
	});
	expect(slots(draft as Element)).toEqual({
		title: "Draft list for 30 Oct 2026",
		subtitle: "KBank S (RI), KBank K",
		amount: "−฿2.00",
	});
	expect(slots(plan as Element)).toEqual({
		title: "Planned: pay SCB K (RI) in 2 days",
		subtitle: "02 Nov 2026",
		amount: "+฿5,000.00",
	});
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
	expect(text(root, ".a-sub")).toBe("4 cards");
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
	expect(root.querySelector(".a-badge, .tag")).toBeNull();
	expect(text(root, '[data-item="overdue"] .a-title')).toBe(
		"เลยกำหนด: SCB K (RI)",
	);
	expect(text(root, '[data-item="overdue"] .a-sub')).toBe("เป็นเวลา 16 วัน");
});

test("the overdue amount carries the danger tone, with its words", async () => {
	const root = await mount([
		{ kind: "overdue", card, remaining: 100, dueDate: "2026-10-30", days: 1 },
	]);
	const amount = root
		.querySelector('[data-item="overdue"]')
		?.closest(".a-row")
		?.querySelector(".amount");
	expect(amount?.classList.contains("danger")).toBe(true);
	expect(text(root, '[data-item="overdue"] .a-title')).toContain("Overdue");
});

test("one day overdue reads in the singular", async () => {
	const root = await mount([
		{ kind: "overdue", card, remaining: 100, dueDate: "2026-10-30", days: 1 },
	]);
	expect(text(root, '[data-item="overdue"] .a-title')).toBe(
		"Overdue: SCB K (RI)",
	);
	expect(text(root, '[data-item="overdue"] .a-sub')).toBe("for 1 day");
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
	expect(await title("2026-10-31")).toBe("Planned: pay SCB K (RI) today");
	expect(await title("2026-11-01")).toBe("Planned: pay SCB K (RI) tomorrow");
	expect(await title("2026-11-03")).toBe("Planned: pay SCB K (RI) in 3 days");
	expect(await title("2026-10-30")).toBe("Planned: pay SCB K (RI) 1 day ago");
	expect(await title("2026-10-28")).toBe("Planned: pay SCB K (RI) 3 days ago");
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
