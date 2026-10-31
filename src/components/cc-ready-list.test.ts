import { afterEach, expect, test } from "bun:test";
import "#components/cc-ready-list";
import type { CcReadyList } from "#components/cc-ready-list";
import type { ReadyRow } from "#lib/domain/home";
import type { Card, LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const card = (id: string): Card => ({
	id,
	name: `Card ${id}`,
	last4: "1111",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
});

const group: LimitGroup = { id: "g", name: "G", limit: 100_000_00 };

const row = (
	id: string,
	room: number,
	closeDate: string,
	dueDate: string,
	extra: { sharedWith?: number; overdue?: boolean } = {},
): ReadyRow => ({
	card: card(id),
	room: {
		group,
		used: 40_000_00,
		available: room,
		held: 0,
		room,
		level: "within",
		sharedWith: extra.sharedWith ?? 0,
	} as ReadyRow["room"],
	closeDate,
	dueDate,
	overdue: extra.overdue ?? false,
});

const rows = (): ReadyRow[] => [
	row("A", 60_000_00, "2026-11-10", "2026-11-25", { overdue: true }),
	row("B", 80_000_00, "2026-11-25", "2026-12-15", { sharedWith: 1 }),
	row("C", 20_000_00, "2026-11-18", "2026-12-03"),
];

const mount = async (props: Partial<CcReadyList> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-ready-list") as CcReadyList;
	Object.assign(element, {
		rows: rows(),
		selected: [],
		locations: ["krabi", "bangkok"],
		today: "2026-10-31",
		unassigned: 0,
		...props,
	});
	document.body.append(element);
	await element.updateComplete;
	return { element, root: element.shadowRoot as ShadowRoot };
};

const order = (root: ParentNode) =>
	[...root.querySelectorAll("[data-card]")].map((el) =>
		el.getAttribute("data-card"),
	);
const pressed = (root: ParentNode, sort: string) =>
	root.querySelector(`[data-sort="${sort}"]`)?.getAttribute("aria-pressed");
const flat = (el: Element | ParentNode | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim();

test("rows start with the most room", async () => {
	const { root } = await mount();
	expect(order(root)).toEqual(["B", "A", "C"]);
	expect(pressed(root, "room")).toBe("true");
});

test("a chip re-sorts", async () => {
	const { element, root } = await mount();
	(root.querySelector('[data-sort="close"]') as HTMLElement).click();
	await element.updateComplete;
	expect(order(root)).toEqual(["B", "C", "A"]);
	expect(pressed(root, "close")).toBe("true");
	expect(pressed(root, "room")).toBe("false");
	expect(pressed(root, "due")).toBe("false");
});

test("tapping a card asks to toggle it", async () => {
	const { element, root } = await mount();
	const events: CustomEvent[] = [];
	element.addEventListener("toggle", (e) =>
		events.push(e as unknown as CustomEvent),
	);
	(root.querySelector('[data-card="A"]') as HTMLElement).click();
	expect(events.length).toBe(1);
	expect(events[0]?.detail).toEqual({ cardId: "A" });
	const again = await mount({ selected: ["A"] });
	expect(
		again.root.querySelector('[data-card="A"]')?.getAttribute("aria-pressed"),
	).toBe("true");
	expect(
		again.root.querySelector('[data-card="B"]')?.getAttribute("aria-pressed"),
	).toBe("false");
});

test("a row says its room, dates and usage in words", async () => {
	const { root } = await mount();
	const b = root.querySelector('[data-card="B"]') as HTMLElement;
	expect(flat(b)).toContain("฿80,000.00");
	expect(flat(b)).toContain("room · shared");
	expect(flat(b)).toContain("Closes 25 Nov 2026 · in 25 days");
	expect(flat(b)).toContain("Due 15 Dec 2026");
	expect(b.querySelector(".usage")?.getAttribute("aria-label")).toBe(
		"40% of the limit used",
	);
	const a = root.querySelector('[data-card="A"]') as HTMLElement;
	expect(flat(a)).toContain("฿60,000.00");
	expect(flat(a)).not.toContain("shared");
	expect(flat(a)).toContain("Overdue bill");
	expect(flat(b)).not.toContain("Overdue bill");
	expect(flat(root.querySelector('[data-card="C"]'))).not.toContain(
		"Overdue bill",
	);
});

test("nothing ready names the next step", async () => {
	const { root } = await mount({ rows: [] });
	expect(
		root.querySelector('[data-action="settings"]')?.getAttribute("href"),
	).toBe("/settings");
	expect(root.querySelectorAll("[data-card]").length).toBe(0);
});

test("not-assigned cards are counted", async () => {
	const { root } = await mount({ unassigned: 2 });
	expect(root.querySelector('a[href="/cards"]')).not.toBeNull();
	expect(flat(root)).toContain("2 cards have no limit group yet.");
});

test("reads in Thai", async () => {
	setLocale("th");
	const { root } = await mount();
	const chips = [...root.querySelectorAll("[data-sort]")].map((c) => flat(c));
	expect(chips).toEqual([
		"วงเงินเหลือมากสุด",
		"อีกนานสุดกว่าจะสรุปยอด",
		"ครบกำหนดช้าสุด",
	]);
	expect(flat(root.querySelector("h2"))).toContain("พร้อมใช้");
});
