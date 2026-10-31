import { expect, test } from "bun:test";
import "#components/cc-statement-list";
import { buildStatement } from "#lib/domain/statement";
import type { Card, LedgerStatement, Purchase } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const purchases: Purchase[] = [
	{
		id: "a",
		cardId: "kbank",
		date: "2026-09-05",
		amount: 10_000,
		note: "fuel",
	},
	{
		id: "b",
		cardId: "kbank",
		date: "2026-09-18",
		amount: 25_000,
		note: "parts",
	},
];

/** A ledger statement for `period`, `paidAmount` of it settled. Open when it closes after `today`. */
const stmt = (
	period: string,
	list: Purchase[],
	paidAmount = 0,
	open = false,
): LedgerStatement => {
	const built = buildStatement(card, period, list);
	return {
		cardId: built.cardId,
		period,
		closeDate: built.closeDate,
		dueDate: built.dueDate,
		purchases: built.purchases,
		total: built.total,
		paidAmount,
		remaining: built.total - paidAmount,
		paid: paidAmount > 0 && built.total - paidAmount === 0,
		open,
	};
};

const mount = async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-statement-list");
	element.statements = [
		stmt("2026-09", purchases),
		// Kept whole although empty: it is marked open, as the period purchases land on is.
		stmt("2026-08", [], 0, true),
	];
	element.today = "2026-09-25";
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("lists each statement with its dates, purchases, and total", async () => {
	const element = await mount();
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("18 Sep 2026");
	expect(text).toContain("03 Oct 2026");
	expect(text).toContain("fuel");
	expect(text).toContain("฿350.00");
});

const detailsFor = (element: Element, period: string): HTMLDetailsElement => {
	const found = [
		...(element.shadowRoot?.querySelectorAll<HTMLDetailsElement>("details") ??
			[]),
	].find((details) => details.textContent?.includes(period));
	if (!found) throw new Error(`no statement for period ${period}`);
	return found;
};

test("starts a month that has purchases open", async () => {
	const element = await mount();
	expect(detailsFor(element, "2026-09").open).toBe(true);
});

test("starts a month with no purchases collapsed", async () => {
	const element = await mount();
	expect(detailsFor(element, "2026-08").open).toBe(false);
});

test("names the period, the dates, and the total on the collapsed line", async () => {
	const element = await mount();
	const summary =
		detailsFor(element, "2026-08").querySelector("summary")?.textContent ?? "";
	expect(summary).toContain("2026-08");
	expect(summary).toContain("18 Aug 2026");
	expect(summary).toContain("02 Sep 2026");
	expect(summary).toContain("฿0.00");
});

test("shows a settled statement as paid in full, and a part-paid one with what is paid and left", async () => {
	const element = await mountStatements([
		stmt("2026-09", purchases, 15_000),
		stmt(
			"2026-08",
			[{ ...(purchases[0] as Purchase), date: "2026-08-10" }],
			10_000,
		),
	]);
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("Paid in full");
	expect(text).toContain("Paid ฿150.00");
	expect(text).toContain("฿200.00 left");
	expect(text).not.toContain("Mark paid");
	expect(
		element.shadowRoot?.querySelector("[data-action='mark-paid']"),
	).toBeNull();
	expect(
		element.shadowRoot?.querySelector("[data-action='unmark-paid']"),
	).toBeNull();
});

test("emits delete-purchase with the purchase id", async () => {
	const element = await mount();
	let detail: { cardId: string; purchaseId: string } | undefined;
	element.addEventListener("delete-purchase", (event) => {
		detail = (event as CustomEvent<{ cardId: string; purchaseId: string }>)
			.detail;
	});
	element.shadowRoot
		?.querySelector<HTMLButtonElement>("[data-action='delete-purchase']")
		?.click();
	expect(detail).toEqual({ cardId: "kbank", purchaseId: "a" });
});

test("renders its statement text and buttons in the chosen language", async () => {
	setLocale("en");
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Delete");
	expect(element.shadowRoot?.textContent).toContain("Total");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("ลบ");
	expect(element.shadowRoot?.textContent).toContain("รวม");
});

test("renders the destructive and secondary actions as their variants", async () => {
	const element = await mount();

	expect(
		element.shadowRoot?.querySelector(
			'[data-action="delete-purchase"][data-variant="danger"]',
		),
	).not.toBeNull();
});

const mountStatements = async (
	statements: LedgerStatement[],
	today = "2026-09-25",
) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-statement-list");
	element.statements = statements;
	element.today = today;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("folds a run of closed, empty, unpaid months into one quiet line", async () => {
	const element = await mountStatements([
		// Open (closes 18 Oct, after today): kept whole even with nothing on it.
		stmt("2026-10", purchases, 0, true),
		stmt("2026-09", purchases),
		// Empty but with money on it: kept whole.
		{ ...stmt("2026-08", []), paidAmount: 1_000, remaining: -1_000 },
		stmt("2026-07", []),
		stmt("2026-06", []),
		stmt("2026-05", []),
	]);
	const shadow = element.shadowRoot;
	const periods = [...(shadow?.querySelectorAll("article .period") ?? [])].map(
		(node) => node.textContent,
	);
	expect(periods).toEqual(["2026-10", "2026-09", "2026-08"]);

	const quiet = [...(shadow?.querySelectorAll(".quiet") ?? [])];
	expect(quiet).toHaveLength(1);
	// Oldest first, so the range reads forwards.
	expect(quiet[0]?.textContent?.trim()).toBe(
		"2026-05 – 2026-07 · no purchases",
	);
});

test("names a lone quiet month on its own, and breaks runs around a month with purchases", async () => {
	const june: Purchase = {
		id: "c",
		cardId: "kbank",
		date: "2026-06-10",
		amount: 5_000,
		note: "tyres",
	};
	const element = await mountStatements([
		stmt("2026-08", []),
		stmt("2026-07", []),
		stmt("2026-06", [june]),
		stmt("2026-05", []),
	]);
	const quiet = [...(element.shadowRoot?.querySelectorAll(".quiet") ?? [])].map(
		(node) => node.textContent?.trim(),
	);
	expect(quiet).toEqual([
		"2026-07 – 2026-08 · no purchases",
		"2026-05 · no purchases",
	]);
	expect(element.shadowRoot?.textContent).toContain("tyres");
});

test("says so when there are no statements, in the chosen language", async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-statement-list");
	element.statements = [];
	element.today = "2026-09-25";
	document.body.append(element);
	await element.updateComplete;

	setLocale("en");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("No statements yet.");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("ยังไม่มีใบแจ้งยอด");
});

test("emits edit-purchase with the purchase id", async () => {
	const element = await mount();
	let detail: { cardId: string; purchaseId: string } | undefined;
	element.addEventListener("edit-purchase", (event) => {
		detail = (event as CustomEvent<{ cardId: string; purchaseId: string }>)
			.detail;
	});
	const edit = element.shadowRoot?.querySelector<HTMLButtonElement>(
		"[data-action='edit-purchase']",
	);
	expect(edit?.getAttribute("data-variant")).toBe("quiet");
	edit?.click();
	expect(detail).toEqual({ cardId: "kbank", purchaseId: "a" });
});

test("marks the statement still open today as the current one, and only that one", async () => {
	const element = await mount();
	// 2026-09 closes on the 18th, so it is the open statement on the 10th.
	element.today = "2026-09-10";
	// A statement ahead of the open one, as a purchase dated into the future makes.
	element.statements = [stmt("2026-10", purchases), ...element.statements];
	await element.updateComplete;

	const current = [
		...(element.shadowRoot?.querySelectorAll("article[data-current]") ?? []),
	];
	expect(current).toHaveLength(1);
	expect(current[0]?.querySelector(".period")?.textContent).toBe("2026-09");
	expect(current[0]?.querySelector(".badge")?.textContent).toBe("Current");

	setLocale("th");
	await element.updateComplete;
	expect(
		element.shadowRoot?.querySelector("article[data-current] .badge")
			?.textContent,
	).toBe("รอบปัจจุบัน");
	setLocale("en");
});

test("marks no statement current when every one has closed", async () => {
	const element = await mount();
	element.today = "2026-12-01";
	await element.updateComplete;
	expect(element.shadowRoot?.querySelector("article[data-current]")).toBeNull();
});

test("holds a purchase's edit and delete buttons together in one actions row", async () => {
	const element = await mount();
	const group = element.shadowRoot?.querySelector(
		"td.purchase-actions > .actions[row]",
	);
	expect(
		[...(group?.querySelectorAll("button") ?? [])].map((button) =>
			button.getAttribute("data-action"),
		),
	).toEqual(["edit-purchase", "delete-purchase"]);
});
