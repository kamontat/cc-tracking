import { afterEach, expect, test } from "bun:test";
import "#components/cc-card-statements";
import type { CcCardStatements } from "#components/cc-card-statements";
import type { LedgerStatement, Purchase } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const TODAY = "2026-10-30";

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
	id: "p1",
	cardId: "kb",
	date: "2026-10-02",
	amount: 1_200_00,
	note: "fuel",
	...overrides,
});

const statement = (
	overrides: Partial<LedgerStatement> = {},
): LedgerStatement => ({
	cardId: "kb",
	period: "2026-11",
	closeDate: "2026-11-10",
	dueDate: "2026-12-05",
	purchases: [],
	total: 0,
	paidAmount: 0,
	payments: [],
	remaining: 0,
	paid: false,
	open: true,
	...overrides,
});

const current = statement({
	purchases: [purchase({ id: "c1", date: "2026-10-20", note: "rice" })],
	total: 500_00,
	remaining: 500_00,
});
const dueSoon = statement({
	period: "2026-10",
	closeDate: "2026-10-10",
	dueDate: "2026-11-04",
	open: false,
	purchases: [
		purchase(),
		purchase({ id: "p2", date: "2026-09-20", note: "", amount: 300_00 }),
	],
	total: 1_500_00,
	paidAmount: 500_00,
	remaining: 1_000_00,
});
const quietA = statement({
	period: "2026-09",
	closeDate: "2026-09-10",
	dueDate: "2026-10-05",
	open: false,
	paid: true,
});
const quietB = statement({
	period: "2026-08",
	closeDate: "2026-08-10",
	dueDate: "2026-09-04",
	open: false,
	paid: true,
});
const paid = statement({
	period: "2026-07",
	closeDate: "2026-07-10",
	dueDate: "2026-08-04",
	open: false,
	purchases: [purchase({ id: "p3", date: "2026-07-01" })],
	total: 1_200_00,
	paidAmount: 1_200_00,
	remaining: 0,
	paid: true,
});

const mount = async (props: Partial<CcCardStatements> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement(
		"cc-card-statements",
	) as CcCardStatements;
	Object.assign(element, {
		statements: [current, dueSoon, quietA, quietB, paid],
		today: TODAY,
		...props,
	});
	document.body.append(element);
	await element.updateComplete;
	return { element, root: element.shadowRoot as ShadowRoot };
};

const text = (el: Node | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim() ?? "";

const rows = (root: ShadowRoot) => [
	...root.querySelectorAll<HTMLElement>("[data-period]"),
];
const row = (root: ShadowRoot, period: string) =>
	root.querySelector<HTMLElement>(`[data-period="${period}"]`);

test("each statement reads Mon YYYY with its tag, its dates and what is left", async () => {
	const { root } = await mount();
	expect(rows(root).map((r) => r.getAttribute("data-period"))).toEqual([
		"2026-11",
		"2026-10",
		"2026-07",
	]);
	const cur = row(root, "2026-11");
	expect(text(cur?.querySelector(".name"))).toBe("Nov 2026");
	expect(text(cur?.querySelector(".tag"))).toBe("Current");
	expect(text(cur?.querySelector(".sub"))).toBe(
		"closes 10 Nov 2026 · due 05 Dec 2026",
	);
	expect(text(cur?.querySelector(".left"))).toBe("฿500.00");
	expect(cur?.querySelector(".left")?.hasAttribute("data-numeric")).toBe(true);

	const soon = row(root, "2026-10");
	expect(text(soon?.querySelector(".tag"))).toBe("Due in 5 days");
	expect(soon?.querySelector(".tag")?.getAttribute("data-urgency")).toBe(
		"soon",
	);
	expect(text(soon?.querySelector(".left"))).toBe("฿1,000.00");
	expect(text(soon?.querySelector(".paid-part"))).toBe("Paid ฿500.00");

	const done = row(root, "2026-07");
	expect(text(done?.querySelector(".tag"))).toBe("Paid");
	expect(text(done?.querySelector(".sub"))).toBe("paid in full");
	expect(text(done?.querySelector(".left"))).toBe("฿0.00");
});

test("an overdue statement says by how many days; a later one names its due date", async () => {
	let { root } = await mount({ today: "2026-11-07" });
	let tag = row(root, "2026-10")?.querySelector(".tag");
	expect(text(tag)).toBe("Overdue 3 days");
	expect(tag?.getAttribute("data-urgency")).toBe("overdue");
	({ root } = await mount({ today: "2026-10-12" }));
	tag = row(root, "2026-10")?.querySelector(".tag");
	expect(text(tag)).toBe("Due 04 Nov 2026");
});

test("quiet months fold into one line", async () => {
	const { root } = await mount();
	expect([...root.querySelectorAll(".quiet")].map(text)).toEqual([
		"Aug 2026 – Sep 2026 · no purchases",
	]);
});

test("a statement with purchases is a button that unfolds them", async () => {
	const { element, root } = await mount();
	const head = row(root, "2026-10")?.querySelector<HTMLButtonElement>(
		"button.head",
	);
	expect(head?.getAttribute("aria-expanded")).toBe("false");
	expect(root.querySelector('[data-purchase="p1"]')).toBeNull();
	head?.click();
	await element.updateComplete;
	expect(head?.getAttribute("aria-expanded")).toBe("true");
	const line = root.querySelector('[data-purchase="p1"]');
	expect(text(line?.querySelector(".pdate"))).toBe("02 Oct 2026");
	expect(text(line?.querySelector(".pnote"))).toBe("fuel");
	expect(text(line?.querySelector(".pamount"))).toBe("฿1,200.00");
	expect(head?.getAttribute("aria-controls")).toBe(
		row(root, "2026-10")?.querySelector(".purchases")?.id,
	);
	head?.click();
	await element.updateComplete;
	expect(root.querySelector('[data-purchase="p1"]')).toBeNull();
});

test("a folded statement points at no list, since none is rendered", async () => {
	const { root } = await mount();
	const head = row(root, "2026-10")?.querySelector("button.head");
	expect(head?.hasAttribute("aria-controls")).toBe(false);
});

test("once a confirmed delete's row is gone, focus moves to the statement's button", async () => {
	const { element, root } = await mount();
	row(root, "2026-10")
		?.querySelector<HTMLButtonElement>("button.head")
		?.click();
	await element.updateComplete;
	const line = () => root.querySelector('[data-purchase="p1"]');
	line()
		?.querySelector<HTMLButtonElement>('[data-action="delete-purchase"]')
		?.click();
	await element.updateComplete;
	line()
		?.querySelector<HTMLButtonElement>('[data-action="confirm-delete"]')
		?.click();
	await element.updateComplete;
	element.statements = [
		current,
		{ ...dueSoon, purchases: dueSoon.purchases.slice(1) },
		quietA,
		quietB,
		paid,
	];
	await element.updateComplete;
	expect(line()).toBeNull();
	expect(root.activeElement).toBe(
		row(root, "2026-10")?.querySelector("button.head") ?? null,
	);
});

test("a delete that fails leaves focus where it was", async () => {
	const { element, root } = await mount();
	row(root, "2026-10")
		?.querySelector<HTMLButtonElement>("button.head")
		?.click();
	await element.updateComplete;
	const line = () => root.querySelector('[data-purchase="p1"]');
	line()
		?.querySelector<HTMLButtonElement>('[data-action="delete-purchase"]')
		?.click();
	await element.updateComplete;
	line()
		?.querySelector<HTMLButtonElement>('[data-action="confirm-delete"]')
		?.click();
	await element.updateComplete;
	const before = root.activeElement;
	element.statements = [current, dueSoon, quietA, quietB, paid];
	await element.updateComplete;
	expect(line()).not.toBeNull();
	expect(root.activeElement).toBe(before);
});

test("a statement with nothing on it is not a button", async () => {
	const { root } = await mount({
		statements: [statement()],
	});
	expect(row(root, "2026-11")?.querySelector("button")).toBeNull();
});

test("Edit asks the page to edit that purchase", async () => {
	const { element, root } = await mount();
	row(root, "2026-10")
		?.querySelector<HTMLButtonElement>("button.head")
		?.click();
	await element.updateComplete;
	const got: string[] = [];
	element.addEventListener("edit-purchase", (e) =>
		got.push((e as CustomEvent<{ purchase: Purchase }>).detail.purchase.id),
	);
	root
		.querySelector<HTMLButtonElement>(
			'[data-purchase="p2"] [data-action="edit-purchase"]',
		)
		?.click();
	expect(got).toEqual(["p2"]);
});

test("Delete swaps to Delete ฿X? with Delete and Keep, and focus follows the swap", async () => {
	const { element, root } = await mount();
	row(root, "2026-10")
		?.querySelector<HTMLButtonElement>("button.head")
		?.click();
	await element.updateComplete;
	const got: string[] = [];
	element.addEventListener("delete-purchase", (e) =>
		got.push((e as CustomEvent<{ purchase: Purchase }>).detail.purchase.id),
	);
	const line = () => root.querySelector('[data-purchase="p1"]');
	line()
		?.querySelector<HTMLButtonElement>('[data-action="delete-purchase"]')
		?.click();
	await element.updateComplete;
	expect(text(line()?.querySelector(".ask"))).toBe("Delete ฿1,200.00?");
	const confirm = line()?.querySelector<HTMLButtonElement>(
		'[data-action="confirm-delete"]',
	);
	expect(confirm?.getAttribute("data-variant")).toBe("danger");
	expect(root.activeElement).toBe(confirm ?? null);
	expect(got).toEqual([]);

	line()?.querySelector<HTMLButtonElement>('[data-action="keep"]')?.click();
	await element.updateComplete;
	expect(line()?.querySelector(".ask")).toBeNull();
	expect(root.activeElement).toBe(
		line()?.querySelector('[data-action="delete-purchase"]') ?? null,
	);

	line()
		?.querySelector<HTMLButtonElement>('[data-action="delete-purchase"]')
		?.click();
	await element.updateComplete;
	line()
		?.querySelector<HTMLButtonElement>('[data-action="confirm-delete"]')
		?.click();
	expect(got).toEqual(["p1"]);
});

test("no statements says where purchases come from", async () => {
	const { root } = await mount({ statements: [] });
	expect(text(root)).toBe(
		"No statements yet. Purchases come from purchase lists on Home.",
	);
});

test("a language switch re-renders in place", async () => {
	const { element, root } = await mount();
	setLocale("th");
	await element.updateComplete;
	expect(text(row(root, "2026-11")?.querySelector(".tag"))).toBe("รอบปัจจุบัน");
	expect(text(row(root, "2026-11")?.querySelector(".name"))).toBe("พ.ย. 2026");
});

const payment = (
	id: string,
	date: string,
	amount: number,
): LedgerStatement["payments"][number]["payment"] => ({
	id,
	cardId: "kb",
	date,
	amount,
	status: "paid",
});

const withPayments = statement({
	period: "2026-10",
	closeDate: "2026-10-10",
	dueDate: "2026-11-04",
	open: false,
	purchases: [
		purchase({ id: "p2", date: "2026-09-20", note: "rice", amount: 300_00 }),
		purchase({ id: "p1", date: "2026-10-02", amount: 1_200_00 }),
	],
	total: 1_500_00,
	paidAmount: 700_00,
	payments: [
		{ payment: payment("y1", "2026-09-25", 500_00), amount: 500_00 },
		{ payment: payment("y2", "2026-10-20", 900_00), amount: 200_00 },
	],
	remaining: 800_00,
});

const lines = (root: ShadowRoot, period: string) => [
	...(row(root, period)?.querySelectorAll<HTMLElement>(".purchases > li") ??
		[]),
];

test("an unfolded statement lists its payment parts among its purchases, by date", async () => {
	const { element, root } = await mount({ statements: [withPayments] });
	row(root, "2026-10")
		?.querySelector<HTMLButtonElement>("button.head")
		?.click();
	await element.updateComplete;
	expect(
		lines(root, "2026-10").map(
			(li) =>
				li.getAttribute("data-purchase") ?? li.getAttribute("data-payment"),
		),
	).toEqual(["p2", "y1", "p1", "y2"]);

	const whole = root.querySelector<HTMLElement>('[data-payment="y1"]');
	expect(text(whole?.querySelector(".pdate"))).toBe("25 Sep 2026");
	expect(text(whole?.querySelector(".pnote"))).toBe("Payment");
	expect(text(whole?.querySelector(".pamount"))).toBe("+฿500.00");
	expect(whole?.querySelector(".pamount")?.hasAttribute("data-numeric")).toBe(
		true,
	);
	expect(whole?.querySelector(".ppart")).toBeNull();

	const split = root.querySelector<HTMLElement>('[data-payment="y2"]');
	expect(text(split?.querySelector(".pamount"))).toBe("+฿200.00");
	expect(text(split?.querySelector(".ppart"))).toBe("(part of ฿900.00)");
});

test("a payment part has no Edit or Delete", async () => {
	const { element, root } = await mount({ statements: [withPayments] });
	row(root, "2026-10")
		?.querySelector<HTMLButtonElement>("button.head")
		?.click();
	await element.updateComplete;
	for (const id of ["y1", "y2"]) {
		const line = root.querySelector(`[data-payment="${id}"]`);
		expect(line).not.toBeNull();
		expect(line?.querySelector("button")).toBeNull();
	}
});

test("two parts of one payment on one statement read as one line", async () => {
	const y = payment("y1", "2026-09-25", 1_000_00);
	const { element, root } = await mount({
		statements: [
			statement({
				...withPayments,
				payments: [
					{ payment: y, amount: 300_00 },
					{ payment: y, amount: 400_00 },
				],
			}),
		],
	});
	row(root, "2026-10")
		?.querySelector<HTMLButtonElement>("button.head")
		?.click();
	await element.updateComplete;
	const lines = root.querySelectorAll('[data-payment="y1"]');
	expect(lines.length).toBe(1);
	expect(text(lines[0]?.querySelector(".pamount"))).toBe("+฿700.00");
	expect(text(lines[0]?.querySelector(".ppart"))).toBe("(part of ฿1,000.00)");
});

test("a statement with payments and no purchases still unfolds", async () => {
	const { element, root } = await mount({
		statements: [
			statement({
				...withPayments,
				purchases: [],
				payments: [
					{ payment: payment("y1", "2026-09-25", 500_00), amount: 500_00 },
				],
			}),
		],
	});
	const head = row(root, "2026-10")?.querySelector<HTMLButtonElement>(
		"button.head",
	);
	expect(head).not.toBeNull();
	head?.click();
	await element.updateComplete;
	expect(root.querySelector('[data-payment="y1"]')).not.toBeNull();
});

test("a payment reads in Thai", async () => {
	setLocale("th");
	const { element, root } = await mount({ statements: [withPayments] });
	row(root, "2026-10")
		?.querySelector<HTMLButtonElement>("button.head")
		?.click();
	await element.updateComplete;
	const split = root.querySelector<HTMLElement>('[data-payment="y2"]');
	expect(text(split?.querySelector(".pnote"))).toBe(
		"การชำระ (ส่วนหนึ่งของ ฿900.00)",
	);
});
