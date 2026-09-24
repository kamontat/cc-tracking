import { expect, test } from "bun:test";
import "#components/cc-card-table";
import type { Card, LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	owner: "KC",
	supplementary: false,
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const mount = async (
	cards: Card[],
	purchaseCounts: Record<string, number> = {},
	groups: LimitGroup[] = [],
) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-card-table");
	element.cards = cards;
	element.purchaseCounts = purchaseCounts;
	element.groups = groups;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("shows the card's fields and an active row's controls", async () => {
	const element = await mount([card]);
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("KBank Visa");
	expect(text).toContain("4821");
	expect(text).toContain("Krabi");
	expect(
		element.shadowRoot?.querySelector('button[data-variant="danger"]'),
	).not.toBeNull();
});

test("shows a purchase count instead of delete once the card has purchases", async () => {
	const element = await mount([card], { kbank: 3 });
	expect(element.shadowRoot?.textContent).toContain("3 purchases");
	expect(
		element.shadowRoot?.querySelector('button[data-variant="danger"]'),
	).toBeNull();
});

test("no longer has a purchases column -- that answer moved to settings", async () => {
	const element = await mount([card]);
	expect(
		element.shadowRoot?.querySelector('td[data-field="can-purchase"]'),
	).toBeNull();
});

test("names whose card each one is through the group it draws on", async () => {
	const element = await mount(
		[
			{ ...card, id: "kbank", limitGroupId: "pool" },
			{ ...card, id: "scb", limitGroupId: "solo" },
			{ ...card, id: "ttb", limitGroupId: "gone" },
			{ ...card, id: "uob" },
		],
		{},
		[
			{ id: "pool", name: "KBank account", limit: 500_000, owner: "RI" },
			{ id: "solo", name: "SCB", limit: 100_000 },
		],
	);
	const cells = [
		...(element.shadowRoot?.querySelectorAll<HTMLElement>(
			'td[data-field="owner"]',
		) ?? []),
	];

	expect(cells).toHaveLength(4);
	expect(cells[0]?.textContent?.trim()).toBe("RI");
	// A group carrying no owner reads as the default.
	expect(cells[1]?.textContent?.trim()).toBe("KC");
	// A group that is gone, and a card with no group at all, have nobody to attribute to.
	expect(cells[2]?.textContent?.trim()).toBe("Not assigned");
	expect(cells[3]?.textContent?.trim()).toBe("Not assigned");
});

test("marks a supplementary card and leaves an ordinary one unmarked", async () => {
	const element = await mount([
		{ ...card, id: "kbank", supplementary: true },
		{ ...card, id: "scb" },
	]);
	const rows = [
		...(element.shadowRoot?.querySelectorAll<HTMLElement>("tbody tr") ?? []),
	];

	expect(rows[0]?.querySelector(".supplementary")?.textContent).toContain(
		"Supplementary card",
	);
	expect(rows[1]?.querySelector(".supplementary")).toBeNull();
});

test("emits edit, archive, and remove with the card id", async () => {
	const element = await mount([card]);
	const events: Record<string, string> = {};
	for (const name of ["edit", "archive", "remove"]) {
		element.addEventListener(name, (event) => {
			events[name] = (event as CustomEvent<string>).detail;
		});
	}
	const buttons = [
		...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>("button") ??
			[]),
	];
	for (const button of buttons) button.click();
	expect(events).toEqual({ edit: "kbank", archive: "kbank", remove: "kbank" });
});

test("names the limit group each card draws on", async () => {
	const element = await mount(
		[
			{ ...card, limitGroupId: "pool" },
			{ ...card, id: "scb" },
		],
		{},
		[{ id: "pool", name: "KBank account", limit: 500_000 }],
	);
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("KBank account");
	expect(text).toContain("Not assigned");
});

test("renders its column headings and empty state in the chosen language", async () => {
	setLocale("en");
	const element = await mount([]);
	expect(element.shadowRoot?.textContent).toContain(
		"No cards yet. Add the first one with the form above.",
	);

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain(
		"ยังไม่มีบัตร เพิ่มใบแรกด้วยแบบฟอร์มด้านบน",
	);
});
