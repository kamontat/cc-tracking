import { expect, test } from "bun:test";
import "#components/cc-card-summary";
import { buildStatement } from "#lib/domain/statement";
import type { Card, LimitGroup, Purchase } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card: Card = {
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
};

const group: LimitGroup = { id: "pool", name: "KBank account", limit: 100_000 };

const purchase: Purchase = {
	id: "a",
	cardId: "kbank",
	date: "2026-08-10",
	amount: 85_000,
	note: "fuel",
};

type Props = {
	group: LimitGroup | null;
	used: number;
	sharedWith: number;
	owed: number;
	next: ReturnType<typeof buildStatement> | null;
	today: string;
};

const mount = async (overrides: Partial<Props> = {}) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-card-summary");
	Object.assign(element, {
		group,
		used: 85_000,
		sharedWith: 0,
		owed: 85_000,
		// 2026-08 closes 18 Aug, due 02 Sep; today is 2026-08-30, so due soon.
		next: buildStatement(card, "2026-08", [purchase]),
		today: "2026-08-30",
		...overrides,
	});
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const tile = (element: Element, name: string) =>
	element.shadowRoot?.querySelector<HTMLElement>(`[data-tile="${name}"]`);

test("shows what the group has left, of what limit, with a bar tinted as it runs out", async () => {
	const element = await mount();
	const available = tile(element, "available");
	expect(available?.textContent).toContain("฿150.00");
	expect(available?.textContent).toContain("of ฿1,000.00 · KBank account");
	expect(available?.querySelector(".usage")?.getAttribute("data-level")).toBe(
		"high",
	);
	expect(available?.dataset["level"]).toBe("high");
});

test("says how many other cards share the group, one or many", async () => {
	expect(tile(await mount(), "available")?.textContent).not.toContain("Shared");
	expect(
		tile(await mount({ sharedWith: 1 }), "available")?.textContent,
	).toContain("Shared with 1 other card");
	expect(
		tile(await mount({ sharedWith: 3 }), "available")?.textContent,
	).toContain("Shared with 3 other cards");
});

test("says so when the card draws on no group", async () => {
	const element = await mount({ group: null });
	expect(tile(element, "available")?.textContent).toContain(
		"This card draws on no limit group.",
	);
	expect(tile(element, "available")?.querySelector(".usage")).toBeNull();
});

test("shows what this card owes", async () => {
	const element = await mount({ owed: 123_456 });
	expect(tile(element, "owed")?.textContent).toContain("฿1,234.56");
});

test("shows the next statement due, its amount, and how urgent it is", async () => {
	const element = await mount();
	const next = tile(element, "next");
	expect(next?.textContent).toContain("฿850.00");
	expect(next?.textContent).toContain("Due 02 Sep 2026");
	expect(next?.dataset["urgency"]).toBe("soon");
});

test("names the closing date of a statement that is still open", async () => {
	const element = await mount({ today: "2026-08-12" });
	const next = tile(element, "next");
	expect(next?.textContent).toContain("Still open, closes 18 Aug 2026");
	expect(next?.dataset["urgency"]).toBe("future");
});

test("says nothing is due when the next statement owes nothing", async () => {
	const element = await mount({
		next: buildStatement(card, "2026-09", []),
	});
	expect(tile(element, "next")?.textContent).toContain("Nothing due");
});

test("renders in the chosen language", async () => {
	const element = await mount();
	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("ครบกำหนดถัดไป");
	setLocale("en");
});
