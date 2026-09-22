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
	expect(text).toContain("4821");
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
	element.shadowRoot?.querySelector<HTMLButtonElement>("button")?.click();
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
