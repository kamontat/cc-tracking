import { afterEach, expect, test } from "vitest";
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
		billed: 41_230_00,
		startDate: "2026-08-19",
		closeDate: "2026-09-30",
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

const mountEl = async (value: NeedsItem[], cards: Card[] = []) => {
	const root = await mount(value, cards);
	return { element: root.host as CcNeedsYou, root };
};

/** Taps a row's head and waits for the repaint. */
const open = async (element: CcNeedsYou, head: string) => {
	element.shadowRoot?.querySelector<HTMLElement>(head)?.click();
	await element.updateComplete;
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
	amount: text(row, ".a-hit .amount"),
});

test("every row head is one button that opens it in place, no link", async () => {
	const root = await mount(
		[...items(), planned("2026-11-02")],
		[],
		"2026-10-31",
	);
	const heads = [...root.querySelectorAll("[data-item]")];
	expect(heads.map((e) => e.getAttribute("data-item"))).toEqual([
		"waiting",
		"overdue",
		"draft",
		"planned",
	]);
	for (const head of heads) {
		expect(head.localName).toBe("button");
		expect(head.getAttribute("aria-expanded")).toBe("false");
		expect(head.querySelector("a, button")).toBeNull();
		const details = root.getElementById(
			head.getAttribute("aria-controls") ?? "",
		);
		expect(details?.hidden).toBe(true);
	}
	expect(root.querySelector("a.a-hit")).toBeNull();
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
		title: "Planned: pay SCB K (RI)",
		subtitle: "02 Nov 2026 · in 2 days",
		amount: "+฿5,000.00",
	});
	expect(root.querySelector(".a-hit button, .a-hit a")).toBeNull();
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
		{
			kind: "overdue",
			card,
			remaining: 100,
			billed: 100,
			startDate: "2026-08-19",
			closeDate: "2026-10-15",
			dueDate: "2026-10-30",
			days: 1,
		},
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
		{
			kind: "overdue",
			card,
			remaining: 100,
			billed: 100,
			startDate: "2026-08-19",
			closeDate: "2026-10-15",
			dueDate: "2026-10-30",
			days: 1,
		},
	]);
	expect(text(root, '[data-item="overdue"] .a-title')).toBe(
		"Overdue: SCB K (RI)",
	);
	expect(text(root, '[data-item="overdue"] .a-sub')).toBe("for 1 day");
});

test("a list id is encoded in its opened row's link", async () => {
	const { element, root } = await mountEl([
		{ kind: "waiting", list: list("w 1/2", "sent", ["A"]), total: 100 },
		{ kind: "draft", list: list("d&1", "draft", ["A"]), total: 100 },
	]);
	await open(element, '[data-item="waiting"]');
	await open(element, '[data-item="draft"]');
	expect(
		[...root.querySelectorAll(".a-details:not([hidden]) a[data-action]")].map(
			(e) => e.getAttribute("href"),
		),
	).toEqual(["/list/draft?id=d%261"]);
	await open(element, '[data-item="waiting"]');
	expect(
		root
			.querySelector(".a-details:not([hidden]) a[data-action=record-reply]")
			?.getAttribute("href"),
	).toBe("/list/reply?id=w%201%2F2");
});

test("a planned payment says how far off it is after its date, and a past plan how long ago", async () => {
	const row = async (date: string) => {
		const root = await mount([planned(date)], [], "2026-10-31");
		return [text(root, ".a-title"), text(root, ".a-sub")];
	};
	expect(await row("2026-10-31")).toEqual([
		"Planned: pay SCB K (RI)",
		"31 Oct 2026 · today",
	]);
	expect((await row("2026-11-01"))[1]).toBe("01 Nov 2026 · tomorrow");
	expect((await row("2026-11-03"))[1]).toBe("03 Nov 2026 · in 3 days");
	expect((await row("2026-10-30"))[1]).toBe("30 Oct 2026 · 1 day ago");
	expect((await row("2026-10-28"))[1]).toBe("28 Oct 2026 · 3 days ago");
	setLocale("th");
	expect((await row("2026-10-30"))[0]).toBe("วางแผนไว้: ชำระ SCB K (RI)");
	setLocale("en");
});

const many = (count: number): NeedsItem[] =>
	Array.from({ length: count }, (_, i) => ({
		kind: "waiting" as const,
		list: list(`w${i}`, "sent", ["A"]),
		total: 100,
	}));

const shown = (root: ShadowRoot) =>
	[...root.querySelectorAll("[data-row]")].map((e) =>
		e.getAttribute("data-row"),
	);

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
	expect(shown(root)).toEqual([0, 1, 2, 3, 4].map((i) => `list:w${i}`));
	const more = root.querySelector<HTMLButtonElement>('[data-action="more"]');
	expect(more?.getAttribute("type")).toBe("button");
	expect(more?.getAttribute("data-variant")).toBe("quiet");
	expect(more?.getAttribute("aria-expanded")).toBe("false");
	expect(more?.textContent?.trim()).toBe("See more (3)");
	more?.click();
	await element.updateComplete;
	expect(shown(root)).toEqual(
		[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `list:w${i}`),
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

const events = (element: CcNeedsYou, name: string) => {
	const seen: unknown[] = [];
	element.addEventListener(name, (e) => seen.push((e as CustomEvent).detail));
	return seen;
};

/** Each matching element's text, in order. */
const parts = (root: ParentNode, selector: string) =>
	[...root.querySelectorAll(selector)].map((e) => e.textContent?.trim());

const shownDetails = (root: ShadowRoot) =>
	root.querySelector<HTMLElement>(".a-details:not([hidden])");

test("opening one row closes the other; a second tap closes it", async () => {
	const { element, root } = await mountEl(items());
	await open(element, '[data-item="waiting"]');
	expect(
		root.querySelector('[data-item="waiting"]')?.getAttribute("aria-expanded"),
	).toBe("true");
	await open(element, '[data-item="overdue"]');
	expect(
		[...root.querySelectorAll("[data-item]")].map((e) =>
			e.getAttribute("aria-expanded"),
		),
	).toEqual(["false", "true", "false"]);
	expect(root.querySelectorAll(".a-details:not([hidden])")).toHaveLength(1);
	await open(element, '[data-item="overdue"]');
	expect(root.querySelector(".a-details:not([hidden])")).toBeNull();
});

test("an opened overdue bill draws its billing cycle in red to today, says what is left, and offers Pay the amount and Open card", async () => {
	const item: NeedsItem = {
		kind: "overdue",
		card,
		remaining: 41_230_00,
		billed: 50_000_00,
		startDate: "2026-08-19",
		closeDate: "2026-09-18",
		dueDate: "2026-10-03",
		days: 28,
	};
	const { element, root } = await mountEl([item]);
	await open(element, '[data-item="overdue"]');
	const details = shownDetails(root) as HTMLElement;
	const line = details.querySelector<HTMLElement>(".a-cycle");
	expect(line?.getAttribute("role")).toBe("img");
	expect(line?.getAttribute("aria-label")).toBe(
		"Closed 18 Sep, due 3 Oct (28 days late), today 31 Oct",
	);
	expect(
		[...(line?.querySelectorAll<HTMLElement>(".a-mk") ?? [])].map((m) => [
			m.dataset["mark"],
			m.textContent?.trim(),
			m.hasAttribute("data-late"),
		]),
	).toEqual([
		["closed", "Closed 18 Sep", false],
		["due", "Due 3 Oct", true],
		["now", "Today", false],
	]);
	// The line runs from the statement's start to a few days past today, so today sits inside.
	const now = line?.querySelector<HTMLElement>('.a-mk[data-mark="now"]');
	const fill = line?.querySelector<HTMLElement>(".a-fill");
	expect(fill?.hasAttribute("data-late")).toBe(true);
	expect(fill?.style.getPropertyValue("inline-size")).toBe(
		now?.style.getPropertyValue("inset-inline-start") as string,
	);
	expect(text(details, ".a-say")).toBe(
		"฿41,230.00 left of ฿50,000.00 billed, 28 days late",
	);
	expect(parts(details, ".a-say .a-money")).toEqual([
		"฿41,230.00",
		"฿50,000.00",
	]);
	const links = [...details.querySelectorAll(".a-btns > *")];
	expect(
		links.map((e) => [
			e.localName,
			e.className,
			e.getAttribute("data-variant"),
		]),
	).toEqual([
		["a", "btn", null],
		["a", "btn", "quiet"],
	]);
	expect(links.map((e) => e.textContent?.trim())).toEqual([
		"Pay ฿41,230.00",
		"Open card",
	]);
	expect(links[0]?.getAttribute("href")).toBe(
		"/pay?card=SCB%2FK&amount=4123000",
	);
	expect(links[1]?.getAttribute("href")).toBe("/card?id=SCB%2FK");
	// One wrapper of buttons, not one inside another.
	expect(details.querySelector(".a-btns .a-btns")).toBeNull();
});

test("a bill one day late says so in the singular", async () => {
	const item: NeedsItem = {
		kind: "overdue",
		card,
		remaining: 100,
		billed: 100,
		startDate: "2026-09-19",
		closeDate: "2026-10-18",
		dueDate: "2026-10-30",
		days: 1,
	};
	const { element, root } = await mountEl([item]);
	await open(element, '[data-item="overdue"]');
	expect(text(shownDetails(root) as HTMLElement, ".a-say")).toBe(
		"฿1.00 left of ฿1.00 billed, 1 day late",
	);
});

test("an opened planned payment shows its note; Paid emits mark-paid", async () => {
	const item = planned("2026-11-02") as NeedsItem & { kind: "planned" };
	item.payment.note = "rent";
	const { element, root } = await mountEl([item]);
	const marked = events(element, "mark-paid");
	await open(element, '[data-item="planned"]');
	const details = shownDetails(root) as HTMLElement;
	expect(text(details, ".a-say")).toBe("Planned for 2 Nov. rent");
	expect(details.querySelector(".a-cycle, .a-parts")).toBeNull();
	const buttons = [...details.querySelectorAll(".a-btns button")];
	expect(
		buttons.map((b) => [
			b.getAttribute("data-action"),
			b.getAttribute("data-variant"),
		]),
	).toEqual([
		["mark-paid", "quiet"],
		["delete", "danger"],
	]);
	(buttons[0] as HTMLElement).click();
	expect(marked).toEqual([{ payment: item.payment }]);
});

test("a planned payment's Delete asks first: Delete and Cancel, and only the second Delete emits", async () => {
	const item = planned("2026-11-02") as NeedsItem & { kind: "planned" };
	const { element, root } = await mountEl([item]);
	const deleted = events(element, "delete-payment");
	await open(element, '[data-item="planned"]');
	(root.querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	expect(deleted).toEqual([]);
	const asked = [
		...(shownDetails(root) as HTMLElement).querySelectorAll(".a-btns button"),
	];
	expect(asked.map((b) => b.getAttribute("data-action"))).toEqual([
		"confirm-delete",
		"cancel-delete",
	]);
	expect(root.activeElement?.getAttribute("data-action")).toBe(
		"confirm-delete",
	);
	expect(asked[0]?.getAttribute("aria-label")).toBe(
		"Delete ฿5,000.00 to SCB K?",
	);
	(asked[1] as HTMLElement).click();
	await element.updateComplete;
	expect(deleted).toEqual([]);
	expect(root.activeElement?.getAttribute("data-action")).toBe("delete");
	(root.querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	(root.querySelector("[data-action=confirm-delete]") as HTMLElement).click();
	expect(deleted).toEqual([{ payment: item.payment }]);
});

test("an opened waiting list shows each line and when it was sent; Confirm asks Save before it emits", async () => {
	const sent: PurchaseList = {
		id: "w1",
		date: "2026-10-30",
		status: "sent",
		lines: [
			{ cardId: "SCB/K", amount: 1_000_00 },
			{ cardId: "X", amount: 250_00 },
		],
	};
	const { element, root } = await mountEl(
		[{ kind: "waiting", list: sent, total: 1_250_00 }],
		[card],
	);
	const saved = events(element, "confirm-list");
	await open(element, '[data-item="waiting"]');
	const details = shownDetails(root) as HTMLElement;
	expect(parts(details, ".a-part > *")).toEqual([
		"SCB/K) SCB K (1111)",
		"฿1,000.00",
		"X) —",
		"฿250.00",
	]);
	expect(details.querySelector(".a-total")).toBeNull();
	expect(text(details, ".a-say")).toBe(
		"Sent 30 Oct. Confirm saves every line as made.",
	);
	const first = [...details.querySelectorAll(".a-btns > *")];
	expect(first.map((e) => e.getAttribute("data-action"))).toEqual([
		"record-reply",
		"confirm-list",
	]);
	expect(first[0]?.localName).toBe("a");
	expect(first[0]?.textContent?.trim()).toBe("Record reply");
	(first[1] as HTMLElement).click();
	await element.updateComplete;
	expect(saved).toEqual([]);
	expect(
		root.querySelector("[data-confirming] [data-action=save-list]"),
	).not.toBeNull();
	(root.querySelector("[data-action=save-list]") as HTMLElement).click();
	await element.updateComplete;
	expect(saved).toEqual([{ list: sent }]);
});

test("an opened draft offers Continue and a one-step Delete", async () => {
	const draft = list("d1", "draft", ["A"]);
	const { element, root } = await mountEl([
		{ kind: "draft", list: draft, total: 100 },
	]);
	const deleted = events(element, "delete-draft");
	await open(element, '[data-item="draft"]');
	const details = shownDetails(root) as HTMLElement;
	expect(parts(details, ".a-part > *")).toEqual(["A) —", "฿1.00"]);
	expect(text(details, ".a-say")).toBe("Not sent yet.");
	const [go, del] = [...details.querySelectorAll(".a-btns > *")];
	expect(go?.getAttribute("href")).toBe("/list/draft?id=d1");
	expect(go?.textContent?.trim()).toBe("Continue");
	expect(del?.getAttribute("data-variant")).toBe("danger");
	(del as HTMLElement).click();
	expect(deleted).toEqual([{ list: draft }]);
});

test("the open row and a half-done swap survive a repaint; a row that goes is forgotten", async () => {
	const item = planned("2026-11-02") as NeedsItem & { kind: "planned" };
	const { element, root } = await mountEl([...items(), item]);
	await open(element, '[data-item="planned"]');
	(root.querySelector("[data-action=delete]") as HTMLElement).click();
	await element.updateComplete;
	element.items = [...items(), item];
	await element.updateComplete;
	expect(
		root.querySelector('[data-item="planned"]')?.getAttribute("aria-expanded"),
	).toBe("true");
	expect(root.querySelector("[data-action=confirm-delete]")).not.toBeNull();
	element.items = items();
	await element.updateComplete;
	element.items = [...items(), item];
	await element.updateComplete;
	expect(
		root.querySelector('[data-item="planned"]')?.getAttribute("aria-expanded"),
	).toBe("false");
});

test("opened rows read in Thai", async () => {
	setLocale("th");
	const { element, root } = await mountEl([
		{
			kind: "overdue",
			card,
			remaining: 100,
			billed: 100,
			startDate: "2026-08-19",
			closeDate: "2026-09-18",
			dueDate: "2026-10-03",
			days: 28,
		},
		{ kind: "draft", list: list("d1", "draft", ["A"]), total: 100 },
	]);
	await open(element, '[data-item="overdue"]');
	const due = shownDetails(root) as HTMLElement;
	expect(parts(due, ".a-btns > *")).toEqual(["ชำระ ฿1.00", "เปิดบัตร"]);
	expect(text(due, ".a-say")).toBe("เหลือ ฿1.00 จากยอด ฿1.00 เลยกำหนดมา 28 วัน");
	expect(parts(due, ".a-mk")).toEqual([
		"สรุปยอดแล้ว 18 ก.ย.",
		"ครบกำหนด 3 ต.ค.",
		"วันนี้",
	]);
	await open(element, '[data-item="draft"]');
	expect(text(shownDetails(root) as HTMLElement, ".a-say")).toBe("ยังไม่ได้ส่ง");
});

test("a half-done swap ends when its row closes, when another opens, or when its row goes", async () => {
	const item = planned("2026-11-02") as NeedsItem & { kind: "planned" };
	const { element, root } = await mountEl([...items(), item]);
	const ask = async () => {
		(
			root.querySelector(
				".a-details:not([hidden]) [data-action=delete]",
			) as HTMLElement
		).click();
		await element.updateComplete;
		expect(root.querySelector("[data-action=confirm-delete]")).not.toBeNull();
	};
	await open(element, '[data-item="planned"]');
	await ask();
	await open(element, '[data-item="planned"]');
	await open(element, '[data-item="planned"]');
	expect(root.querySelector("[data-action=confirm-delete]")).toBeNull();
	await ask();
	await open(element, '[data-item="overdue"]');
	await open(element, '[data-item="planned"]');
	expect(root.querySelector("[data-action=confirm-delete]")).toBeNull();
	await ask();
	element.items = items();
	await element.updateComplete;
	element.items = [...items(), item];
	await element.updateComplete;
	await open(element, '[data-item="planned"]');
	expect(root.querySelector("[data-action=confirm-delete]")).toBeNull();
});

test("a Needs you plan says its note once, in its details", async () => {
	const item = planned("2026-11-02") as NeedsItem & { kind: "planned" };
	const noted = { ...item, payment: { ...item.payment, note: "Salary day" } };
	const { element, root } = await mountEl([noted]);
	await open(element, '[data-item="planned"]');
	const row = root.querySelector("[data-row]")?.textContent ?? "";
	expect(row.split("Salary day").length - 1).toBe(1);
	expect(
		root.querySelector(".a-details:not([hidden]) .a-say")?.textContent,
	).toContain("Salary day");
});

test("an opened overdue bill's line is fitted by measuring its labels", async () => {
	const item: NeedsItem = {
		kind: "overdue",
		card,
		remaining: 100,
		billed: 100,
		startDate: "2026-08-19",
		closeDate: "2026-09-18",
		dueDate: "2026-10-03",
		days: 28,
	};
	const { element, root } = await mountEl([item]);
	const real = HTMLElement.prototype.getBoundingClientRect;
	// Every label laid out on top of the others: only Due keeps its words.
	HTMLElement.prototype.getBoundingClientRect = function () {
		return this.classList.contains("a-lbl")
			? ({ left: 0, right: 100, width: 100 } as DOMRect)
			: real.call(this);
	};
	try {
		await open(element, '[data-item="overdue"]');
		expect(
			[
				...(shownDetails(root)?.querySelectorAll<HTMLElement>(".a-mk") ?? []),
			].map((m) => [m.dataset["mark"], m.hasAttribute("data-quiet")]),
		).toEqual([
			["closed", true],
			["due", false],
			["now", false],
		]);
	} finally {
		HTMLElement.prototype.getBoundingClientRect = real;
	}
});
