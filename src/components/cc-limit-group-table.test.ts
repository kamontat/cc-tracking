import { expect, test } from "bun:test";
import "#components/cc-limit-group-table";
import { DEFAULT_GROUP_VIEW, type GroupView } from "#lib/domain/list-view";
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

test("heads the table with no explanatory note", async () => {
	const element = await mount();
	expect(element.shadowRoot?.querySelector("details > p")).toBeNull();
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

const rowNames = (element: HTMLElement) =>
	[
		...(element.shadowRoot?.querySelectorAll<HTMLElement>(
			'td[data-label="Name"]',
		) ?? []),
	].map((cell) => cell.textContent?.trim());

test("has no toolbar while there are no groups", async () => {
	const element = await mount({ groups: [] });
	expect(element.shadowRoot?.querySelector(".toolbar")).toBeNull();
});

test("lists the groups its view lets through, in the view's order", async () => {
	const element = await mount({
		view: { ...DEFAULT_GROUP_VIEW, sort: "available", dir: "desc" },
	});
	// available: pool 3,000.00, solo 1,000.00
	expect(rowNames(element)).toEqual(["KBank account", "SCB"]);

	element.view = { ...DEFAULT_GROUP_VIEW, owner: "KC" };
	await element.updateComplete;
	expect(rowNames(element)).toEqual(["SCB"]);
});

test("says nothing matches when the view filters every group out", async () => {
	const element = await mount({
		view: { ...DEFAULT_GROUP_VIEW, q: "nothing like this" },
	});
	expect(element.shadowRoot?.textContent).toContain(
		"No limit groups match these filters.",
	);
	expect(element.shadowRoot?.querySelector("table")).toBeNull();
});

test("emits the next view from its search, owner chip, headings and clear", async () => {
	const element = await mount({
		view: { ...DEFAULT_GROUP_VIEW, sort: "limit" },
	});
	const seen: GroupView[] = [];
	element.addEventListener("view-change", (event) =>
		seen.push((event as CustomEvent<GroupView>).detail),
	);
	const root = element.shadowRoot;
	const search = root?.querySelector<HTMLInputElement>('.toolbar [name="q"]');
	const owner = root?.querySelector<HTMLSelectElement>(
		'.toolbar [name="owner"]',
	);
	if (!search || !owner) throw new Error("toolbar fields missing");
	search.value = "kbank";
	search.dispatchEvent(new Event("input"));
	owner.value = "RI";
	owner.dispatchEvent(new Event("change"));
	const heading = (key: string) =>
		root?.querySelector<HTMLButtonElement>(`th button[data-sort="${key}"]`);
	heading("limit")?.click();
	heading("cards")?.click();
	root
		?.querySelector<HTMLButtonElement>('.toolbar [data-action="clear"]')
		?.click();

	const sorted = { ...DEFAULT_GROUP_VIEW, sort: "limit" as const };
	expect(seen).toEqual([
		{ ...sorted, q: "kbank" },
		{ ...sorted, owner: "RI" },
		{ ...sorted, dir: "desc" },
		{ ...DEFAULT_GROUP_VIEW, sort: "cards" },
		DEFAULT_GROUP_VIEW,
	]);
});

test("sorts from every data heading, numeric ones right-aligned", async () => {
	const element = await mount();
	const headings = [
		...(element.shadowRoot?.querySelectorAll<HTMLElement>("th[aria-sort]") ??
			[]),
	].map((th) => [
		th.querySelector("button")?.dataset["sort"],
		th.hasAttribute("data-numeric"),
	]);
	expect(headings).toEqual([
		["name", false],
		["owner", false],
		["limit", true],
		["cards", true],
		["used", true],
		["available", true],
	]);
});

test("sorts by card count with the counts it was handed", async () => {
	const element = await mount({
		counts: { pool: 0, solo: 4 },
		view: { ...DEFAULT_GROUP_VIEW, sort: "cards", dir: "desc" },
	});
	expect(rowNames(element)).toEqual(["SCB", "KBank account"]);
});

test("counts the groups showing once the view has moved", async () => {
	const element = await mount({
		view: { ...DEFAULT_GROUP_VIEW, owner: "RI" },
	});
	expect(
		element.shadowRoot?.querySelector('.toolbar [data-field="count"]')
			?.textContent,
	).toBe("1 of 2 groups");
});
