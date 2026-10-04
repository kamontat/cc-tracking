import { expect, test } from "bun:test";
import "#components/cc-due-list";
import type { DueRow } from "#components/cc-due-list";
import { buildStatement } from "#lib/domain/statement";
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

const purchases: Purchase[] = [
	{
		id: "a",
		cardId: "kbank",
		date: "2026-09-05",
		amount: 35_000,
		note: "fuel",
	},
];

/** The row's own "Mark paid" button, not one of the sorting headings. */
const MARK_PAID = 'button[data-action="mark-paid"]';

const mount = async (rows: DueRow[], today: string) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-due-list");
	element.rows = rows;
	element.today = today;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("shows the card, its total, and both dates", async () => {
	const element = await mount(
		[{ card, statement: buildStatement(card, "2026-09", purchases) }],
		"2026-09-25",
	);
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("KBank Visa");
	// The id, not the last four digits: the id is what the card is called everywhere else.
	expect(text).toContain("kbank");
	expect(text).not.toContain("4821");
	expect(text).toContain("Krabi");
	expect(text).toContain("฿350.00");
	expect(text).toContain("18 Sep 2026");
	expect(text).toContain("03 Oct 2026");
});

test("marks an overdue statement", async () => {
	const element = await mount(
		[{ card, statement: buildStatement(card, "2026-09", purchases) }],
		"2026-10-10",
	);
	expect(
		element.shadowRoot?.querySelector("[data-urgency='overdue']"),
	).not.toBeNull();
});

test("emits mark-paid with the card and period", async () => {
	const element = await mount(
		[{ card, statement: buildStatement(card, "2026-09", purchases) }],
		"2026-09-25",
	);
	let detail: { cardId: string; period: string } | undefined;
	element.addEventListener("mark-paid", (event) => {
		detail = (event as CustomEvent<{ cardId: string; period: string }>).detail;
	});
	element.shadowRoot?.querySelector<HTMLButtonElement>(MARK_PAID)?.click();
	expect(detail).toEqual({ cardId: "kbank", period: "2026-09" });
});

test("says so when there is nothing to pay", async () => {
	const element = await mount([], "2026-09-25");
	expect(element.shadowRoot?.textContent).toContain("No cards yet");
});

test("renders its empty state and column headings in the chosen language", async () => {
	setLocale("en");
	const element = await mount([], "2026-09-25");
	expect(element.shadowRoot?.textContent).toContain("No cards yet.");
	expect(element.shadowRoot?.textContent).toContain("Add one on the");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("ยังไม่มีบัตร");
	expect(element.shadowRoot?.textContent).toContain("เพิ่มบัตรได้ที่หน้าบัตร");
});

test("labels every cell so the row stays readable once stacked", async () => {
	const element = await mount(
		[{ card, statement: buildStatement(card, "2026-09", purchases) }],
		"2026-09-25",
	);

	const labels = [
		...(element.shadowRoot?.querySelectorAll("tbody td[data-label]") ?? []),
	].map((cell) => cell.getAttribute("data-label"));

	expect(labels).toEqual(["Card", "Where", "Closes", "Due", "Total"]);
	expect(
		element.shadowRoot?.querySelector("td[data-numeric]")?.textContent,
	).toContain("฿350.00");
});

test("shows an urgency badge, not colour alone", async () => {
	const element = await mount(
		[{ card, statement: buildStatement(card, "2026-09", purchases) }],
		"2026-10-10",
	);

	const badge = element.shadowRoot?.querySelector(
		'[data-urgency="overdue"] .badge',
	);
	expect(badge?.textContent).toContain("7 days overdue");
});

test("keeps the card cell's layout hook when the locale changes", async () => {
	setLocale("th");
	const element = await mount(
		[{ card, statement: buildStatement(card, "2026-09", purchases) }],
		"2026-09-25",
	);

	const cell = element.shadowRoot?.querySelector("td.card-cell");
	expect(cell).not.toBeNull();
	expect(cell?.getAttribute("data-label")).toBe("บัตร");
});

const dueRows = (): DueRow[] =>
	// Due dates run the other way (late 29 Sep, mid 03 Oct, soon 05 Oct), so close order
	// cannot pass for the old due-first order.
	(
		[
			["late", 28, 1],
			["soon", 5, 30],
			["mid", 18, 15],
		] as const
	).map(([id, closeDay, dueOffsetDays]) => {
		const entry: Card = {
			...card,
			id,
			name: `${id} card`,
			cycle: { kind: "offset", closeDay, dueOffsetDays },
		};
		return { card: entry, statement: buildStatement(entry, "2026-09", []) };
	});

const order = (element: HTMLElement) =>
	[...(element.shadowRoot?.querySelectorAll("a.card-name") ?? [])].map(
		(link) => link.textContent,
	);

test("lists the soonest close date first", async () => {
	setLocale("en");
	const element = await mount(dueRows(), "2026-09-01");
	expect(order(element)).toEqual(["soon card", "mid card", "late card"]);
});

test("sorts from its column headings: ascending, descending, then closes first again", async () => {
	setLocale("en");
	const element = await mount(dueRows(), "2026-09-01");
	const heading = () =>
		element.shadowRoot?.querySelector<HTMLButtonElement>(
			'th button[data-sort="card"]',
		);
	const seen: (string | null)[][] = [];
	for (let click = 0; click < 3; click++) {
		heading()?.click();
		await element.updateComplete;
		seen.push(order(element));
	}
	expect(seen).toEqual([
		["late card", "mid card", "soon card"],
		["soon card", "mid card", "late card"],
		["soon card", "mid card", "late card"],
	]);
	expect(heading()?.closest("th")?.getAttribute("aria-sort")).toBe("none");
});

test("sorts from the narrow layout's sort chip", async () => {
	setLocale("en");
	const element = await mount(dueRows(), "2026-09-01");
	const sort = element.shadowRoot?.querySelector<HTMLSelectElement>(
		'select[name="sort"]',
	);
	if (!sort) throw new Error("no sort chip");
	sort.value = "closes:desc";
	sort.dispatchEvent(new Event("change"));
	await element.updateComplete;
	expect(order(element)).toEqual(["late card", "mid card", "soon card"]);
});
