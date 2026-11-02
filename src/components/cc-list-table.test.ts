import { expect, test } from "bun:test";
import "#components/cc-list-table";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";
import { shareTable } from "#lib/ui/list-share";

const card = (id: string, name: string, last4: string): Card => ({
	id,
	name,
	last4,
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
});

test("the table matches the share table", async () => {
	setLocale("en");
	const cards = [
		card("KB-F", "KBank Fuel", "4412"),
		card("UOB-K", "UOB Krabi", "7765"),
	];
	const list = {
		date: "2026-10-31",
		lines: [
			{ cardId: "KB-F", amount: 12_500_00 },
			{ cardId: "UOB-K", amount: 4_800_00 },
		],
	};
	document.body.innerHTML = "";
	const element = document.createElement("cc-list-table");
	element.list = list;
	element.cards = cards;
	document.body.append(element);
	await element.updateComplete;
	const root = element.shadowRoot as ShadowRoot;
	const table = shareTable(list, cards);
	const texts = (selector: string) =>
		[...root.querySelectorAll(selector)].map((cell) =>
			cell.textContent?.trim(),
		);
	expect(root.querySelector("h3")?.textContent).toBe(table.title);
	expect(root.querySelector("p")?.textContent).toBe(table.date);
	expect(texts("thead th")).toEqual(table.headers);
	expect(texts("tbody td")).toEqual(table.rows.flat());
	expect(texts("tfoot td")).toEqual(table.total);
	expect(root.querySelectorAll("tbody tr")).toHaveLength(2);
	const numeric = (selector: string) =>
		root.querySelector(selector)?.hasAttribute("data-numeric");
	expect(numeric("thead th:last-child")).toBe(true);
	expect(numeric("tfoot td:last-child")).toBe(true);
	expect(root.querySelectorAll("tbody td[data-numeric]")).toHaveLength(2);
});
