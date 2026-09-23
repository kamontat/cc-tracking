import { expect, test } from "bun:test";
import "#components/cc-spendable";
import type { SpendRow } from "#lib/domain/limit";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const card = (id: string): Card => ({
	id,
	name: `${id} card`,
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	canPurchase: true,
	limitGroupId: "pool",
});

const row = (overrides: Partial<SpendRow> = {}): SpendRow => ({
	card: card("kbank"),
	group: { id: "pool", name: "KBank account", limit: 500_000 },
	used: 200_000,
	available: 300_000,
	closeDate: "2026-10-18",
	dueDate: "2026-11-02",
	sharedWith: 0,
	...overrides,
});

const mount = async (overrides: Record<string, unknown> = {}) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-spendable");
	element.rows = [row()];
	element.unassigned = 0;
	Object.assign(element, overrides);
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("shows what is left, the limit it comes from, and both dates", async () => {
	const element = await mount();
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("฿3,000.00");
	expect(text).toContain("฿5,000.00");
	expect(text).toContain("18 Oct 2026");
	expect(text).toContain("02 Nov 2026");
});

test("names the card by both its name and its id", async () => {
	const element = await mount();
	const cell = element.shadowRoot?.querySelector("td");
	expect(cell?.querySelector(".card-name")?.textContent).toContain(
		"kbank card",
	);
	expect(cell?.querySelector(".card-id")?.textContent).toContain("kbank");
});

test("marks a shared group and says how many other cards hold it", async () => {
	const element = await mount({ rows: [row({ sharedWith: 2 })] });
	const shared = element.shadowRoot?.querySelector('[data-shared="true"]');
	expect(shared).not.toBeNull();
	expect(element.shadowRoot?.textContent).toContain("KBank account");
	expect(element.shadowRoot?.textContent).toContain("2");
});

test("marks a row that is over its limit", async () => {
	const element = await mount({ rows: [row({ available: -50_000 })] });
	const cell = element.shadowRoot?.querySelector('[data-state="over"]');
	expect(cell?.textContent).toContain("-฿500.00");
});

test("counts the cards with no limit group and points at the registry", async () => {
	const element = await mount({ unassigned: 2 });
	const notice = element.shadowRoot?.querySelector(
		'[data-testid="unassigned"]',
	);
	expect(notice?.textContent).toContain("2");
	expect(notice?.querySelector("a")?.getAttribute("href")).toBe("/cards");
});

test("says so when no card can take a purchase", async () => {
	const element = await mount({ rows: [] });
	expect(element.shadowRoot?.querySelector("table")).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("No card here can take");
});

test("renders in the chosen language", async () => {
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Can spend now");
	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("รูดได้ตอนนี้");
});
