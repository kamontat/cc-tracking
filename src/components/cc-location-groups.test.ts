import { expect, test } from "bun:test";
import "#components/cc-location-groups";
import type { DueRow } from "#components/cc-due-list";
import type { Location } from "#lib/domain/location";
import { buildStatement } from "#lib/domain/statement";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card = (id: string, location: Location): Card => ({
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
		rowsFor(card("a", "krabi"), card("b", "krabi"), card("c", "bangkok")),
	);
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("Bangkok (1)");
	expect(text).toContain("Krabi (2)");
});

test("names the soonest due date in each group", async () => {
	const element = await mount(rowsFor(card("a", "krabi")));
	expect(element.shadowRoot?.textContent).toContain("03 Oct 2026");
});

test("starts collapsed", async () => {
	const element = await mount(rowsFor(card("a", "krabi")));
	expect(
		element.shadowRoot?.querySelector("details")?.hasAttribute("open"),
	).toBe(false);
});

test("renders its heading, location names, and next-due text in the chosen language", async () => {
	setLocale("en");
	const element = await mount(rowsFor(card("a", "krabi")));
	expect(element.shadowRoot?.textContent).toContain("Cards by location");
	expect(element.shadowRoot?.textContent).toContain("Krabi");
	expect(element.shadowRoot?.textContent).toContain("Next due");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("บัตรแยกตามที่เก็บ");
	expect(element.shadowRoot?.textContent).toContain("กระบี่");
	expect(element.shadowRoot?.textContent).toContain("ครบกำหนดถัดไป");
});

test("orders groups by the translated text, in the code-unit order the comparator actually produces", async () => {
	setLocale("th");
	const element = await mount(
		rowsFor(card("a", "phichit"), card("b", "bangkok"), card("c", "krabi")),
	);
	const headings = [...(element.shadowRoot?.querySelectorAll("h3") ?? [])].map(
		(h3) => h3.textContent ?? "",
	);
	// Without Intl, `<` compares UTF-16 code units rather than Thai collation, so this is
	// not dictionary order: "กระบี่" (krabi) sorts before "กรุงเทพฯ" (bangkok) because its
	// second character, ะ (U+0E30), is a lower code unit than ุ (U+0E38) -- a Thai dictionary
	// compares consonants first and would put กรุงเทพฯ ahead of กระบี่ instead.
	expect(headings).toHaveLength(3);
	expect(headings[0]).toContain("กระบี่");
	expect(headings[1]).toContain("กรุงเทพฯ");
	expect(headings[2]).toContain("พิจิตร");
});
