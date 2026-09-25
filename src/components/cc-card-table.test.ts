import { expect, test } from "bun:test";
import "#components/cc-card-table";
import type { Card, LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
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
	const element = await mount([{ ...card, comment: "glovebox" }]);
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("KBank Visa");
	expect(text).toContain("kbank");
	expect(text).toContain("4821");
	expect(text).toContain("Krabi");
	expect(text).toContain("glovebox");
	expect(
		element.shadowRoot?.querySelector('button[data-variant="danger"]'),
	).not.toBeNull();
});

test("links the card's name to its detail page", async () => {
	const element = await mount([{ ...card, id: "k b" }]);
	const link =
		element.shadowRoot?.querySelector<HTMLAnchorElement>("a.card-name");
	expect(link?.textContent?.trim()).toBe("KBank Visa");
	expect(link?.getAttribute("href")).toBe("/card?id=k%20b");
});

test("counts purchases in the card's details and drops delete once it has any", async () => {
	const element = await mount([card], { kbank: 3 });
	expect(element.shadowRoot?.querySelector(".meta")?.textContent).toContain(
		"3 purchases",
	);
	expect(
		element.shadowRoot?.querySelector('button[data-variant="danger"]'),
	).toBeNull();
});

test("says one purchase, not one purchases", async () => {
	const element = await mount([card], { kbank: 1 });
	expect(element.shadowRoot?.textContent).toContain("1 purchase");
	expect(element.shadowRoot?.textContent).not.toContain("1 purchases");
});

test("keeps archived cards out of the main list, in a section of their own that starts closed", async () => {
	const element = await mount([
		card,
		{ ...card, id: "old", name: "Old UOB", archived: true },
	]);
	const shadow = element.shadowRoot;
	const main = shadow?.querySelector("details.active");
	const archived = shadow?.querySelector<HTMLDetailsElement>(
		"details.archived-list",
	);

	expect(main?.querySelectorAll("tbody tr")).toHaveLength(1);
	expect(main?.textContent).not.toContain("Old UOB");
	expect(archived?.open).toBe(false);
	expect(archived?.querySelector("summary")?.textContent).toContain(
		"Archived (1)",
	);
	expect(archived?.textContent).toContain("Old UOB");
	expect(archived?.textContent).toContain("Unarchive");
});

test("has no archived section when nothing is archived", async () => {
	const element = await mount([card]);
	expect(element.shadowRoot?.querySelector("details.archived-list")).toBeNull();
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
	const rows = [
		...(element.shadowRoot?.querySelectorAll<HTMLElement>("tbody tr") ?? []),
	];
	const owner = (row: HTMLElement | undefined) =>
		row?.querySelector('[data-field="owner"]')?.textContent?.trim();
	const group = (row: HTMLElement | undefined) =>
		row?.querySelector('[data-field="limit-group"]')?.textContent?.trim();

	expect(rows).toHaveLength(4);
	expect(owner(rows[0])).toBe("RI");
	// A group carrying no owner reads as the default.
	expect(owner(rows[1])).toBe("KC");
	// A group that is gone, and a card with no group at all, have nobody to attribute to.
	expect(owner(rows[2])).toBeUndefined();
	expect(group(rows[2])).toBe("Not assigned");
	expect(owner(rows[3])).toBeUndefined();
	expect(group(rows[3])).toBe("Not assigned");
});

test("names the account's owner beside the group, and a supplementary card's own holder beneath", async () => {
	const element = await mount(
		[
			{ ...card, id: "a1", limitGroupId: "pool" },
			{
				...card,
				id: "a2",
				limitGroupId: "pool",
				supplementary: true,
				owner: "NT",
			},
		],
		{},
		[{ id: "pool", name: "Card A pool", limit: 500_000, owner: "KC" }],
	);
	const rows = [
		...(element.shadowRoot?.querySelectorAll<HTMLElement>("tbody tr") ?? []),
	];
	const text = (row: HTMLElement | undefined, field: string) =>
		row?.querySelector(`[data-field="${field}"]`)?.textContent?.trim();

	expect(text(rows[0], "limit-group")).toBe("Card A pool (KC)");
	expect(text(rows[0], "owner")).toBe("KC");
	expect(text(rows[1], "limit-group")).toBe("Card A pool (KC)");
	expect(text(rows[1], "owner")).toBe("NT");
	expect(rows[1]?.querySelector(".owner")?.textContent).toContain("Owner");
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

test("starts open, and stays closed once the reader closes it", async () => {
	const element = await mount([card]);
	const section =
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details");
	if (!section) throw new Error("no details element");
	expect(section.open).toBe(true);

	section.open = false;
	// Round-tripping through empty is what catches an `?open=${...}` binding: a binding whose
	// value never changes is dirty-checked away and reads exactly like the static attribute,
	// so only a render where the bound value would differ tells the two apart.
	element.cards = [];
	await element.updateComplete;
	element.cards = [card];
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details")?.open,
	).toBe(false);
});

test("renders its column headings and empty state in the chosen language", async () => {
	setLocale("en");
	const element = await mount([]);
	expect(element.shadowRoot?.textContent).toContain(
		"No cards yet. Add the first one with the Add a card form.",
	);

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain(
		"ยังไม่มีบัตร เพิ่มใบแรกด้วยแบบฟอร์มเพิ่มบัตร",
	);
});
