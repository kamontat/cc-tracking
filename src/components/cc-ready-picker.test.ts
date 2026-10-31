import { afterEach, expect, test } from "bun:test";
import "#components/cc-ready-picker";
import type { CcReadyPicker } from "#components/cc-ready-picker";
import { setLocale } from "#lib/i18n/index";
import { flat, testRows } from "./ready-test-rows";

afterEach(() => setLocale("en"));

const mount = async (props: Partial<CcReadyPicker> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-ready-picker") as CcReadyPicker;
	Object.assign(element, {
		rows: testRows(),
		selected: [],
		today: "2026-10-31",
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

test("rows keep the order given, one panel, each a ticked toggle", async () => {
	const { root } = await mount();
	expect(order(root)).toEqual(["A", "B", "C"]);
	expect(root.querySelectorAll(".panel")).toHaveLength(1);
	for (const row of root.querySelectorAll("[data-card]")) {
		expect(row.localName).toBe("button");
		expect(row.classList.contains("crow")).toBe(true);
		expect(row.querySelector(".tick")).not.toBeNull();
	}
});

test("tapping a card asks to toggle it, and a picked card reads pressed", async () => {
	const { element, root } = await mount();
	const events: CustomEvent[] = [];
	element.addEventListener("toggle", (e: Event) =>
		events.push(e as CustomEvent),
	);
	(root.querySelector('[data-card="A"]') as HTMLElement).click();
	expect(events.map((e) => e.detail)).toEqual([{ cardId: "A" }]);
	const again = await mount({ selected: ["A"] });
	const pressed = (id: string) =>
		again.root
			.querySelector(`[data-card="${id}"]`)
			?.getAttribute("aria-pressed");
	expect(pressed("A")).toBe("true");
	expect(pressed("B")).toBe("false");
	expect(
		again.root.querySelector('[data-card="A"] .tick .icon'),
	).not.toBeNull();
});

test("a row says its room, dates, usage and an overdue bill in words", async () => {
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
	expect(flat(a)).not.toContain("shared");
	expect(flat(a.querySelector('.tag[data-urgency="overdue"]'))).toBe(
		"Overdue bill",
	);
	expect(b.querySelector(".tag")).toBeNull();
});

test("a card reads in the panel form: the last-4 chip, then id) name", async () => {
	const { root } = await mount();
	const a = root.querySelector('[data-card="A"]') as HTMLElement;
	expect(flat(a.querySelector(".card-label"))).toBe("A) Card A");
	expect(flat(a.querySelector(".mini"))).toBe("1111");
});

test("reads in Thai", async () => {
	setLocale("th");
	const { root } = await mount();
	expect(flat(root.querySelector('[data-card="B"]'))).toContain(
		"วงเงินเหลือ · ใช้ร่วม",
	);
});
