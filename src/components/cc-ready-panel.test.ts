import { afterEach, expect, test } from "bun:test";
import "#components/cc-ready-panel";
import type { CcReadyPanel } from "#components/cc-ready-panel";
import { setLocale } from "#lib/i18n/index";
import { flat, testGroup, testRow, testRows } from "./ready-test-rows";

afterEach(() => setLocale("en"));

const mount = async (props: Partial<CcReadyPanel> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-ready-panel") as CcReadyPanel;
	Object.assign(element, {
		rows: testRows(),
		groups: [testGroup],
		places: ["Bangkok", "Krabi"],
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
		"3 cards in Bangkok, Krabi",
	);
	const one = await mount({ rows: testRows().slice(0, 1) });
	expect(flat(one.root.querySelector(".head small"))).toBe(
		"1 card in Bangkok, Krabi",
	);
});

test("only the three cards with the most room show, each a tile linking to its card page", async () => {
	const rows = [
		...testRows(),
		testRow("D", 90_000_00, "2026-11-10", "2026-11-25"),
		testRow("E/1", 10_000_00, "2026-11-10", "2026-11-25"),
	];
	const { root } = await mount({ rows });
	expect(order(root)).toEqual(["D", "B", "A"]);
	expect(root.querySelectorAll(".tiles")).toHaveLength(1);
	for (const tile of root.querySelectorAll("[data-card]")) {
		expect(tile.localName).toBe("a");
		expect(tile.classList.contains("tile")).toBe(true);
		expect(tile.querySelector(".tick, button, a")).toBeNull();
	}
	expect(root.querySelector('[data-card="D"]')?.getAttribute("href")).toBe(
		"/card?id=D",
	);
	const odd = await mount({
		rows: [testRow("E/1", 10_000_00, "2026-11-10", "2026-11-25")],
	});
	expect(
		odd.root.querySelector('[data-card="E/1"]')?.getAttribute("href"),
	).toBe("/card?id=E%2F1");
});

test("See more (N) opens the rest in place and Show less folds them; there is no Start a list", async () => {
	const rows = [
		...testRows(),
		testRow("D", 90_000_00, "2026-11-10", "2026-11-25"),
		testRow("E", 10_000_00, "2026-11-10", "2026-11-25"),
	];
	const { element, root } = await mount({ rows });
	expect(root.querySelector('[data-action="start"]')).toBeNull();
	expect(root.querySelector('[data-action="see-all"]')).toBeNull();
	const more = () =>
		root.querySelector('[data-action="more"]') as HTMLButtonElement;
	expect(flat(more())).toBe("See more (2)");
	expect(more().getAttribute("data-variant")).toBe("quiet");
	expect(more().getAttribute("aria-expanded")).toBe("false");
	more().click();
	await element.updateComplete;
	expect(order(root)).toHaveLength(5);
	expect(flat(more())).toBe("Show less");
	expect(more().getAttribute("aria-expanded")).toBe("true");
	more().click();
	await element.updateComplete;
	expect(order(root)).toEqual(["D", "B", "A"]);
});

test("three cards or fewer have no See more", async () => {
	const { root } = await mount();
	expect(root.querySelector('[data-action="more"]')).toBeNull();
});

test("nothing ready names the next step and offers no list", async () => {
	const { root } = await mount({ rows: [] });
	expect(
		root.querySelector('[data-action="settings"]')?.getAttribute("href"),
	).toBe("/settings/locations");
	expect(root.querySelectorAll("[data-card]")).toHaveLength(0);
});

test("not-assigned cards are counted", async () => {
	const { root } = await mount({ unassigned: 2 });
	expect(flat(root.querySelector('[data-testid="unassigned"]'))).toContain(
		"2 cards have no limit group yet.",
	);
	expect(root.querySelector('a[href="/cards?ungrouped=1"]')).not.toBeNull();
	const one = await mount({ unassigned: 1 });
	expect(flat(one.root)).toContain("1 card has no limit group yet.");
});

test("reads in Thai", async () => {
	setLocale("th");
	const { root } = await mount();
	expect(flat(root.querySelector("h2"))).toBe("พร้อมใช้");
});

const tile = (root: ParentNode, id: string) =>
	root.querySelector(`[data-card="${id}"]`) as HTMLElement;

test("a tile: id) name and the last 4 on line 1, the room and its word, then when it closes", async () => {
	const { root } = await mount({
		rows: [testRow("A", 60_000_00, "2026-11-25", "2026-12-15")],
	});
	const a = tile(root, "A");
	expect(flat(a.querySelector(".name"))).toBe("A) Card A");
	expect(flat(a.querySelector(".corner"))).toBe("•••• 1111");
	expect(flat(a.querySelector(".room"))).toBe("฿60,000.00 room");
	expect(flat(a.querySelector(".aside"))).toBe("Closes 25 Nov 2026");
	expect(a.querySelector(".facts")).toBeNull();
	expect(a.dataset["g"]).toBe("1");
});

test("between a bill's close and its due date the tile says when it is due", async () => {
	const { root } = await mount({
		rows: [
			testRow("A", 60_000_00, "2026-11-25", "2026-12-15", {
				billDue: "2026-11-21",
			}),
		],
	});
	expect(flat(tile(root, "A").querySelector(".aside"))).toBe("Due 21 Nov 2026");
});

test("over the limit the amount turns red and drops its word; the rail is full and red", async () => {
	const { root } = await mount({
		rows: [
			testRow("O", -21_065_00, "2026-11-10", "2026-11-25", {
				used: 121_065_00,
			}),
		],
	});
	const room = tile(root, "O").querySelector(".room") as HTMLElement;
	expect(flat(room)).toBe("-฿21,065.00");
	expect(room.dataset["tone"]).toBe("bad");
	const rail = tile(root, "O").querySelector(".rail") as HTMLElement;
	expect(rail.dataset["level"]).toBe("over");
	expect(rail.querySelector("span")?.getAttribute("style")).toBe(
		"inline-size: 100%",
	);
});

test("from 80% the word reads N% used in the warn tone, and the rail turns amber", async () => {
	setLocale("th");
	const { root } = await mount({
		rows: [
			testRow("H", 8_000_00, "2026-11-10", "2026-11-25", { used: 92_000_00 }),
		],
	});
	const word = tile(root, "H").querySelector(".room small") as HTMLElement;
	expect(flat(word)).toBe("ใช้ไป 92%");
	expect(word.dataset["tone"]).toBe("warn");
	expect(
		(tile(root, "H").querySelector(".rail") as HTMLElement).dataset["level"],
	).toBe("high");
	expect(flat(tile(root, "H").querySelector(".aside"))).toBe(
		"สรุปยอด 10 พ.ย. 2026",
	);
});

test("no tile says Overdue bill, the owners or shared: Needs you and the colour say them", async () => {
	const { root } = await mount({
		rows: [
			testRow("A", 60_000_00, "2026-11-10", "2026-11-25", {
				overdue: true,
				sharedWith: 1,
				groupOwner: "NT",
				holder: "RI",
			}),
		],
	});
	const text = flat(tile(root, "A")) ?? "";
	expect(text).not.toContain("Overdue");
	expect(text).not.toContain("shared");
	expect(text).not.toContain("NT");
	expect(tile(root, "A").querySelector(".tag")).toBeNull();
});

test("the rail is named by the group's use", async () => {
	const { root } = await mount();
	const rail = tile(root, "A").querySelector(".rail") as HTMLElement;
	expect(rail.getAttribute("role")).toBe("img");
	expect(rail.getAttribute("aria-label")).toBe("40% of the limit used");
	expect(rail.dataset["level"]).toBe("within");
});
