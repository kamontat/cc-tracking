import { expect, test } from "bun:test";
import "#components/cc-location-groups.ts";
import type { DueRow } from "#components/cc-due-list.ts";
import { buildStatement } from "#lib/domain/statement.ts";
import type { Card } from "#lib/domain/types.ts";

const card = (id: string, location: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "0000",
	location,
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
});

const rowsFor = (...cards: Card[]): DueRow[] =>
	cards.map((c) => ({ card: c, statement: buildStatement(c, "2026-09", []) }));

const mount = async (rows: DueRow[]) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-location-groups");
	element.rows = rows;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("groups cards by location and counts them", async () => {
	const element = await mount(
		rowsFor(card("a", "Krabi"), card("b", "Krabi"), card("c", "Bangkok")),
	);
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("Bangkok (1)");
	expect(text).toContain("Krabi (2)");
});

test("names the soonest due date in each group", async () => {
	const element = await mount(rowsFor(card("a", "Krabi")));
	expect(element.shadowRoot?.textContent).toContain("3 Oct 2026");
});

test("starts collapsed", async () => {
	const element = await mount(rowsFor(card("a", "Krabi")));
	expect(
		element.shadowRoot?.querySelector("details")?.hasAttribute("open"),
	).toBe(false);
});

test("falls back to Unknown for a card with an empty location", async () => {
	const element = await mount(rowsFor(card("a", "")));
	expect(element.shadowRoot?.textContent).toContain("Unknown (1)");
});
