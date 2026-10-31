import { afterEach, expect, test } from "bun:test";
import "#components/cc-ready-panel";
import type { CcReadyPanel } from "#components/cc-ready-panel";
import { setLocale } from "#lib/i18n/index";
import { flat, testRow, testRows } from "./ready-test-rows";

afterEach(() => setLocale("en"));

const mount = async (props: Partial<CcReadyPanel> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-ready-panel") as CcReadyPanel;
	Object.assign(element, {
		rows: testRows(),
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

test("the heading counts the ready cards and their places", async () => {
	const { root } = await mount();
	expect(flat(root.querySelector("h2"))).toBe("Ready to use");
	expect(flat(root.querySelector(".head small"))).toBe(
		"3 cards in Krabi, Bangkok",
	);
	const one = await mount({ rows: testRows().slice(0, 1) });
	expect(flat(one.root.querySelector(".head small"))).toBe(
		"1 card in Krabi, Bangkok",
	);
});

test("only the three cards with the most room show, as rows with no tick", async () => {
	const rows = [
		...testRows(),
		testRow("D", 90_000_00, "2026-11-10", "2026-11-25"),
		testRow("E", 10_000_00, "2026-11-10", "2026-11-25"),
	];
	const { root } = await mount({ rows });
	expect(order(root)).toEqual(["D", "B", "A"]);
	for (const row of root.querySelectorAll("[data-card]")) {
		expect(row.localName).toBe("div");
		expect(row.hasAttribute("data-plain")).toBe(true);
		expect(row.querySelector(".tick")).toBeNull();
		expect(row.querySelector("button, a")).toBeNull();
	}
	expect(flat(root.querySelector('[data-card="D"]'))).toContain("฿90,000.00");
	expect(flat(root.querySelector('[data-card="A"]'))).toContain("Overdue bill");
});

test("Start a list and See all both lead to the picker", async () => {
	const { root } = await mount();
	const start = root.querySelector('[data-action="start"]');
	const all = root.querySelector('[data-action="see-all"]');
	expect(start?.getAttribute("href")).toBe("/list/new");
	expect(flat(start)).toBe("Start a list");
	expect(all?.getAttribute("href")).toBe("/list/new");
	expect(flat(all)).toBe("See all 3 ›");
});

test("nothing ready names the next step and offers no list", async () => {
	const { root } = await mount({ rows: [] });
	expect(
		root.querySelector('[data-action="settings"]')?.getAttribute("href"),
	).toBe("/settings");
	expect(root.querySelector('[data-action="start"]')).toBeNull();
	expect(root.querySelectorAll("[data-card]")).toHaveLength(0);
});

test("not-assigned cards are counted", async () => {
	const { root } = await mount({ unassigned: 2 });
	expect(flat(root.querySelector('[data-testid="unassigned"]'))).toContain(
		"2 cards have no limit group yet.",
	);
	expect(root.querySelector('a[href="/cards"]')).not.toBeNull();
	const one = await mount({ unassigned: 1 });
	expect(flat(one.root)).toContain("1 card has no limit group yet.");
});

test("reads in Thai", async () => {
	setLocale("th");
	const { root } = await mount();
	expect(flat(root.querySelector("h2"))).toBe("พร้อมใช้");
	expect(flat(root.querySelector('[data-action="start"]'))).toBe("เริ่มรายการ");
	expect(flat(root.querySelector('[data-action="see-all"]'))).toBe(
		"ดูทั้งหมด 3 ใบ ›",
	);
});
