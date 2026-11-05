import { afterEach, expect, test } from "vitest";
import "#components/cc-list-index";
import type { CcListIndex } from "#components/cc-list-index";
import type { Card, PurchaseList } from "#lib/domain/types";
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

const lists = (): PurchaseList[] => [
	{
		id: "d1",
		date: "2026-10-31",
		status: "draft",
		lines: [{ cardId: "A", amount: 100_00 }],
	},
	{
		id: "w1",
		date: "2026-10-30",
		status: "sent",
		// Sent late on 31 Oct UTC: 1 Nov in Bangkok, the day the sentence says.
		sentAt: "2026-10-31T18:30:00.000Z",
		lines: [
			{ cardId: "A", amount: 100_00 },
			{ cardId: "B", amount: 200_00 },
		],
	},
	{
		id: "s1",
		date: "2026-10-29",
		status: "saved",
		lines: [
			{ cardId: "A", amount: 100_00, made: true, actual: 90_00 },
			{ cardId: "B", amount: 200_00, made: false },
		],
	},
];

const mount = async (props: Partial<CcListIndex> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-list-index") as CcListIndex;
	element.lists = lists();
	element.cards = [card("A"), card("B")];
	element.status = [];
	Object.assign(element, props);
	document.body.append(element);
	await element.updateComplete;
	return { element, root: element.shadowRoot as ShadowRoot };
};

const text = (el: Element | null | undefined) =>
	el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
const head = (root: ShadowRoot, id: string) =>
	root.querySelector<HTMLElement>(`[data-row="list:${id}"] .a-hit`);
const shown = (root: ShadowRoot) =>
	root.querySelector<HTMLElement>(".a-details:not([hidden])");
const events = (el: HTMLElement, name: string) => {
	const seen: unknown[] = [];
	el.addEventListener(name, (e) => seen.push((e as CustomEvent).detail));
	return seen;
};

test("rows are buttons, not links, with date, cards and total", async () => {
	const { root } = await mount();
	expect(root.querySelector("a[data-list]")).toBeNull();
	expect(
		[...root.querySelectorAll(".panel [data-row]")].map((r) =>
			r.getAttribute("data-row"),
		),
	).toEqual(["list:d1", "list:w1", "list:s1"]);
	expect(head(root, "d1")?.localName).toBe("button");
	expect(text(head(root, "w1"))).toContain("2026");
	expect(text(head(root, "w1"))).toContain("Card A, Card B");
	expect(text(head(root, "w1"))).toContain("฿300.00");
	expect(text(head(root, "s1"))).toContain("฿90.00");
	expect(shown(root)).toBeNull();
});

test("a saved list's total is money out, signed and red; a draft's stays muted", async () => {
	const { root } = await mount();
	const s1 = head(root, "s1")?.querySelector(".amount");
	expect(text(s1)).toBe("−฿90.00");
	expect(s1?.classList.contains("out")).toBe(true);
	const d1 = head(root, "d1")?.querySelector(".amount");
	expect(text(d1)).toBe("−฿100.00");
	expect(d1?.classList.contains("muted")).toBe(true);
});

test("a saved list that made nothing shows ฿0.00, unsigned and muted", async () => {
	const none: PurchaseList = {
		id: "z1",
		date: "2026-10-28",
		status: "saved",
		lines: [{ cardId: "A", amount: 100_00, made: false }],
	};
	const { root } = await mount({ lists: [none] });
	const z = head(root, "z1")?.querySelector(".amount");
	expect(text(z)).toBe("฿0.00");
	expect(z?.classList.contains("muted")).toBe(true);
	expect(z?.classList.contains("out")).toBe(false);
});

test("one row is open at a time", async () => {
	const { element, root } = await mount();
	head(root, "d1")?.click();
	await element.updateComplete;
	head(root, "w1")?.click();
	await element.updateComplete;
	expect(root.querySelectorAll(".a-details:not([hidden])").length).toBe(1);
	expect(head(root, "w1")?.getAttribute("aria-expanded")).toBe("true");
	expect(head(root, "d1")?.getAttribute("aria-expanded")).toBe("false");
});

test("an opened draft shows its lines, Continue and a one-step Delete", async () => {
	const { element, root } = await mount();
	const seen = events(element, "delete-draft");
	head(root, "d1")?.click();
	await element.updateComplete;
	const open = shown(root) as HTMLElement;
	expect(text(open.querySelector(".a-part"))).toContain("฿100.00");
	expect(open.querySelector(".a-total")).toBeNull();
	expect(text(open.querySelector(".a-say"))).toBe("Not sent yet.");
	const btns = [...open.querySelectorAll(".a-btns > *")];
	expect(btns.map((b) => b.getAttribute("data-action"))).toEqual([
		"continue",
		"delete-draft",
	]);
	expect(btns[0]?.getAttribute("href")).toBe("/list/draft?id=d1");
	(btns[1] as HTMLElement).click();
	expect(seen).toEqual([{ list: lists()[0] }]);
});

test("an opened sent list offers Record reply and a two-step Confirm", async () => {
	const { element, root } = await mount();
	const seen = events(element, "confirm-list");
	head(root, "w1")?.click();
	await element.updateComplete;
	const btns = [
		...(shown(root) as HTMLElement).querySelectorAll(".a-btns > *"),
	];
	expect(btns.map((b) => b.getAttribute("data-action"))).toEqual([
		"record-reply",
		"confirm-list",
	]);
	expect(btns[0]?.getAttribute("href")).toBe("/list/reply?id=w1");
	expect(text(shown(root)?.querySelector(".a-say"))).toBe(
		"Sent 1 Nov. Confirm saves every line as made.",
	);
	(btns[1] as HTMLElement).click();
	await element.updateComplete;
	expect(seen).toEqual([]);
	(root.querySelector("[data-action=save-list]") as HTMLElement).click();
	expect(seen).toEqual([{ list: lists()[1] }]);
});

test("an opened saved list shows made and not made, and Open links its page", async () => {
	const { element, root } = await mount();
	head(root, "s1")?.click();
	await element.updateComplete;
	const open = shown(root) as HTMLElement;
	const lines = [...open.querySelectorAll(".a-part")].map(text);
	expect(lines[0]).toContain("฿90.00");
	expect(lines[1]).toContain("Not made");
	expect(open.querySelector(".a-total")).toBeNull();
	expect(text(open.querySelector(".a-say"))).toBe("Saved. ฿90.00 bought.");
	expect(text(open.querySelector(".a-say .a-money"))).toBe("฿90.00");
	const btns = [...open.querySelectorAll(".a-btns > *")];
	expect(btns.map((b) => b.getAttribute("data-action"))).toEqual(["open"]);
	expect(btns[0]?.getAttribute("href")).toBe("/list/view?id=s1");
	expect(text(btns[0])).toBe("Open");
});

test("status chips filter and toggle through the event", async () => {
	const { element, root } = await mount({ status: ["saved"] });
	expect(root.querySelectorAll(".panel [data-row]").length).toBe(1);
	expect(
		root.querySelector("[data-status=saved]")?.getAttribute("aria-pressed"),
	).toBe("true");
	const seen: unknown[] = [];
	element.addEventListener("status", (e) =>
		seen.push((e as CustomEvent).detail.status),
	);
	(root.querySelector("[data-status=draft]") as HTMLElement).click();
	(root.querySelector("[data-status=saved]") as HTMLElement).click();
	expect(seen).toEqual([["saved", "draft"], []]);
});

test("empty names the next step", async () => {
	const { root } = await mount({ lists: [] });
	expect(root.querySelector(".empty")?.textContent?.trim()).toBe(
		"No lists yet. Start one from Home.",
	);
});

test("lists that no chip matches say so instead of asking for a first list", async () => {
	const only = lists().filter((l) => l.status === "draft");
	const { root } = await mount({ lists: only, status: ["saved"] });
	expect(root.querySelector(".empty")?.textContent?.trim()).toBe(
		"No list has these statuses. Clear a status to see more.",
	);
	expect(root.querySelector("[data-row]")).toBeNull();
});

test("opened lists read in Thai", async () => {
	setLocale("th");
	const { element, root } = await mount();
	head(root, "s1")?.click();
	await element.updateComplete;
	expect(text(shown(root)?.querySelector(".a-say"))).toBe(
		"บันทึกแล้ว ซื้อไป ฿90.00",
	);
	head(root, "w1")?.click();
	await element.updateComplete;
	expect(text(shown(root)?.querySelector(".a-say"))).toBe(
		"ส่งเมื่อ 1 พ.ย. กดยืนยันเพื่อบันทึกทุกรายการว่าซื้อแล้ว",
	);
});

/** The focused element, through every shadow root. */
const deepActive = (): Element | null => {
	let active: Element | null = document.activeElement;
	while (active?.shadowRoot?.activeElement)
		active = active.shadowRoot.activeElement;
	return active;
};

/** Opens `id`, focuses its draft's Delete, then repaints without the list, as a delete does. */
const deleteDraft = async (all: PurchaseList[], id: string) => {
	const { element, root } = await mount({ lists: all });
	root
		.querySelector<HTMLElement>(`[data-row="list:${id}"] button.a-hit`)
		?.click();
	await element.updateComplete;
	root
		.querySelector<HTMLElement>(
			`[data-row="list:${id}"] [data-action="delete-draft"]`,
		)
		?.focus();
	element.lists = all.filter((l) => l.id !== id);
	await element.updateComplete;
	return root;
};

test("when a deleted draft's row goes, focus moves to the next row's head", async () => {
	const root = await deleteDraft(lists(), "d1");
	expect(root.querySelector('[data-row="list:d1"]')).toBeNull();
	expect(deepActive()).toBe(
		root.querySelector('[data-row="list:w1"] button.a-hit'),
	);
});

test("when the only list goes, focus moves to the empty note", async () => {
	const root = await deleteDraft(lists().slice(0, 1), "d1");
	const empty = root.querySelector<HTMLElement>(".empty");
	expect(empty?.getAttribute("tabindex")).toBe("-1");
	expect(deepActive()).toBe(empty);
});
