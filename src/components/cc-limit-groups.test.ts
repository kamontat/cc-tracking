import { expect, test } from "bun:test";
import "#components/cc-limit-groups";
import type { LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const groups: LimitGroup[] = [
	{ id: "pool", name: "KBank account", limit: 500_000 },
	{ id: "solo", name: "SCB", limit: 100_000 },
];

const mount = async (overrides: Partial<Record<string, unknown>> = {}) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-limit-groups");
	element.groups = groups;
	element.usage = { pool: 200_000, solo: 0 };
	element.counts = { pool: 2, solo: 1 };
	Object.assign(element, overrides);
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const field = (element: HTMLElement, name: string) => {
	const input = element.shadowRoot?.querySelector<HTMLInputElement>(
		`[name="${name}"]`,
	);
	if (!input) throw new Error(`no field named ${name}`);
	return input;
};

const fill = (element: HTMLElement, name: string, value: string) => {
	const input = field(element, name);
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
};

const submit = (element: HTMLElement) =>
	element.shadowRoot
		?.querySelector("form")
		?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

test("shows each group with what it has used and what is left", async () => {
	const element = await mount();
	const text = element.shadowRoot?.textContent ?? "";
	expect(text).toContain("KBank account");
	expect(text).toContain("฿5,000.00");
	expect(text).toContain("฿2,000.00");
	expect(text).toContain("฿3,000.00");
});

test("emits a new group with a generated id", async () => {
	const element = await mount();
	let detail: LimitGroup | undefined;
	element.addEventListener("save-group", (event) => {
		detail = (event as CustomEvent<LimitGroup>).detail;
	});

	fill(element, "groupName", "TTB account");
	fill(element, "groupLimit", "3000");
	submit(element);

	expect(detail?.name).toBe("TTB account");
	expect(detail?.limit).toBe(300_000);
	expect(detail?.id).toBeTruthy();
	expect(detail?.id).not.toBe("pool");
});

test("editing a group keeps its id", async () => {
	const element = await mount();
	let detail: LimitGroup | undefined;
	element.addEventListener("save-group", (event) => {
		detail = (event as CustomEvent<LimitGroup>).detail;
	});

	element.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="edit"][data-id="pool"]')
		?.click();
	await element.updateComplete;

	expect(field(element, "groupName").value).toBe("KBank account");
	fill(element, "groupLimit", "7000");
	submit(element);

	expect(detail).toEqual({ id: "pool", name: "KBank account", limit: 700_000 });
});

test("refuses a group with no name", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("save-group", () => {
		emitted = true;
	});

	fill(element, "groupLimit", "3000");
	submit(element);
	await element.updateComplete;

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("name");
});

test("refuses a limit that is not an amount", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("save-group", () => {
		emitted = true;
	});

	fill(element, "groupName", "TTB");
	fill(element, "groupLimit", "lots");
	submit(element);
	await element.updateComplete;

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("limit");
});

test("offers Delete only on a group no card uses", async () => {
	const element = await mount();
	expect(
		element.shadowRoot?.querySelector('[data-action="remove"][data-id="pool"]'),
	).toBeNull();

	const free = await mount({ counts: { pool: 2, solo: 0 } });
	let removed = "";
	free.addEventListener("remove-group", (event) => {
		removed = (event as CustomEvent<string>).detail;
	});
	free.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="remove"][data-id="solo"]')
		?.click();
	expect(removed).toBe("solo");
});

test("says so when there is no group yet", async () => {
	const element = await mount({ groups: [], usage: {}, counts: {} });
	expect(element.shadowRoot?.querySelector("table")).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("No limit group yet");
});

test("re-renders a displayed error in the new language when the locale switches", async () => {
	const element = await mount();
	fill(element, "groupLimit", "3000");
	submit(element);
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain(
		"Give the limit group a name.",
	);

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("ตั้งชื่อกลุ่มวงเงิน");
});
