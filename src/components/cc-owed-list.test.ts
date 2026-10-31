import { afterEach, expect, test } from "bun:test";
import "#components/cc-owed-list";
import type { CcOwedList } from "#components/cc-owed-list";
import type { PayChoice } from "#lib/domain/pay";
import type { Card } from "#lib/domain/types";
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

const rows = (): PayChoice[] => [
	{
		card: card("A"),
		owed: 500_00,
		credit: 0,
		bill: null,
		urgency: "overdue",
		days: 3,
	} as PayChoice,
	{
		card: card("B/2"),
		owed: 0,
		credit: 120_00,
		bill: null,
		urgency: "none",
		days: 0,
	} as PayChoice,
];

const mount = async (props: Partial<CcOwedList> = {}) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-owed-list") as CcOwedList;
	element.rows = rows();
	element.sort = "urgency";
	Object.assign(element, props);
	document.body.append(element);
	await element.updateComplete;
	return { element, root: element.shadowRoot as ShadowRoot };
};

test("each row opens the payment sheet on its card", async () => {
	const { root } = await mount();
	const links = Array.from(
		root.querySelectorAll<HTMLButtonElement>("button[data-card]"),
	);
	const asked: unknown[] = [];
	const listen = (event: Event) => asked.push((event as CustomEvent).detail);
	document.addEventListener("cc:pay", listen);
	for (const link of links) link.click();
	document.removeEventListener("cc:pay", listen);
	expect(asked).toEqual([{ cardId: "A" }, { cardId: "B/2" }]);
	expect(links[0]?.textContent).toContain("฿500.00");
	expect(links[0]?.textContent).toContain("Overdue 3 days");
	expect(links[1]?.textContent).toContain("Credit ฿120.00");
	expect(links[0]?.querySelector("[data-numeric]")).not.toBeNull();
});

test("the sort chip emits the chosen sort", async () => {
	const { element, root } = await mount();
	let sort = "";
	element.addEventListener("sort", (e) => {
		sort = (e as CustomEvent).detail.sort;
	});
	const select = root.querySelector("select[name=sort]") as HTMLSelectElement;
	select.value = "left";
	select.dispatchEvent(new Event("change"));
	expect(sort).toBe("left");
});

test("empty says nothing is owed", async () => {
	const { root } = await mount({ rows: [] });
	expect(root.querySelector(".empty")?.textContent?.trim()).toBe(
		"Nothing owed on any card.",
	);
});
