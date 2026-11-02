import { afterEach, expect, test } from "bun:test";
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

test("rows link each list's own page with date, cards, status and total", async () => {
	const { root } = await mount();
	const rows = Array.from(root.querySelectorAll("a[data-list]"));
	expect(rows.map((a) => a.getAttribute("href"))).toEqual([
		"/list/draft?id=d1",
		"/list/reply?id=w1",
		"/list/view?id=s1",
	]);
	expect(rows[1]?.textContent).toContain("Waiting for the spender");
	expect(rows[1]?.textContent).toContain("2 cards");
	expect(rows[1]?.textContent).toContain("฿300.00");
	expect(rows[0]?.textContent).toContain("1 card");
	expect(rows[2]?.textContent).toContain("Saved");
	expect(rows[2]?.textContent).toContain("฿90.00");
	expect(rows[0]?.querySelector("[data-numeric]")).not.toBeNull();
});

test("status chips filter and toggle through the event", async () => {
	const { element, root } = await mount({ status: ["saved"] });
	expect(root.querySelectorAll("a[data-list]").length).toBe(1);
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
	expect(root.querySelector("a[data-list]")).toBeNull();
});
