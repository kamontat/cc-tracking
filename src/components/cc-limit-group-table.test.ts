import { expect, test } from "bun:test";
import "#components/cc-limit-group-table";
import type { LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const groups: LimitGroup[] = [
	{ id: "pool", name: "KBank account", limit: 500_000, owner: "RI" },
	{ id: "solo", name: "SCB", limit: 100_000 },
];

const mount = async (overrides: Partial<Record<string, unknown>> = {}) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-limit-group-table");
	element.groups = groups;
	element.usage = { pool: 200_000, solo: 0 };
	element.counts = { pool: 2, solo: 0 };
	Object.assign(element, overrides);
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("shows each group with what it has used and what is left", async () => {
	const element = await mount();
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("KBank account");
	expect(text).toContain("฿5,000.00");
	expect(text).toContain("฿2,000.00");
	expect(text).toContain("฿3,000.00");
});

test("names the owner of each group, falling back to KC", async () => {
	const element = await mount();
	const cells = [
		...(element.shadowRoot?.querySelectorAll<HTMLElement>(
			'td[data-field="owner"]',
		) ?? []),
	];
	expect(cells).toHaveLength(2);
	expect(cells[0]?.textContent?.trim()).toBe("RI");
	expect(cells[1]?.textContent?.trim()).toBe("KC");
});

test("asks the page to edit the group whose button was pressed", async () => {
	const element = await mount();
	let edited = "";
	element.addEventListener("edit-group", (event) => {
		edited = (event as CustomEvent<string>).detail;
	});

	element.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="edit"][data-id="solo"]')
		?.click();

	expect(edited).toBe("solo");
});

test("offers Delete only on a group no card uses", async () => {
	const element = await mount();
	expect(
		element.shadowRoot?.querySelector('[data-action="remove"][data-id="pool"]'),
	).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("2 cards use this group");

	let removed = "";
	element.addEventListener("remove-group", (event) => {
		removed = (event as CustomEvent<string>).detail;
	});
	element.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="remove"][data-id="solo"]')
		?.click();
	expect(removed).toBe("solo");
});

test("marks a group that is over its limit", async () => {
	const element = await mount({ usage: { pool: 600_000, solo: 0 } });
	const cell = element.shadowRoot?.querySelector('td[data-state="over"]');
	expect(cell?.textContent).toContain("-");
});

test("says so when there is no group yet", async () => {
	const element = await mount({ groups: [], usage: {}, counts: {} });
	expect(element.shadowRoot?.querySelector("table")).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("No limit group yet");
});

test("starts open, and stays closed once the reader closes it", async () => {
	const element = await mount();
	const section =
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details");
	if (!section) throw new Error("no details element");
	expect(section.open).toBe(true);

	section.open = false;
	// Round-tripping through empty is what catches an `?open=${...}` binding: a binding whose
	// value never changes is dirty-checked away and reads exactly like the static attribute,
	// so only a render where the bound value would differ tells the two apart.
	element.groups = [];
	await element.updateComplete;
	element.groups = groups;
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details")?.open,
	).toBe(false);
});

test("draws each group's usage as a bar, tinted as it runs out", async () => {
	const element = await mount({
		usage: { pool: 450_000, solo: 150_000 },
	});
	const bars = [
		...(element.shadowRoot?.querySelectorAll<HTMLElement>(".usage") ?? []),
	];
	expect(bars).toHaveLength(2);
	expect(bars[0]?.dataset["level"]).toBe("high");
	expect(bars[0]?.querySelector("span")?.getAttribute("style")).toContain(
		"90%",
	);
	expect(bars[0]?.getAttribute("title")).toBe("90% of the limit used");
	expect(bars[1]?.dataset["level"]).toBe("over");
	expect(bars[1]?.querySelector("span")?.getAttribute("style")).toContain(
		"100%",
	);
});

test("says one card, not one cards", async () => {
	const element = await mount({ counts: { pool: 1, solo: 0 } });
	expect(element.shadowRoot?.textContent).toContain("1 card uses this group");
});

test("renders its headings in the chosen language", async () => {
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Limit groups");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("กลุ่มวงเงิน");
});
