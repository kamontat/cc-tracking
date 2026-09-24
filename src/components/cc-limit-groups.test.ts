import { expect, test } from "bun:test";
import type { CcLimitGroups } from "#components/cc-limit-groups";
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

const submitForm = (element: HTMLElement, which: "add" | "edit") =>
	element.shadowRoot
		?.querySelector(`form[data-form="${which}"]`)
		?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

const submit = (element: HTMLElement) => submitForm(element, "add");

const startEditing = async (element: CcLimitGroups, id: string) => {
	element.shadowRoot
		?.querySelector<HTMLButtonElement>(`[data-action="edit"][data-id="${id}"]`)
		?.click();
	await element.updateComplete;
};

const editingRow = (element: CcLimitGroups) =>
	element.shadowRoot?.querySelector("tr[data-editing]");

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

	await startEditing(element, "pool");

	expect(field(element, "editName").value).toBe("KBank account");
	fill(element, "editLimit", "7000");
	submitForm(element, "edit");

	expect(detail).toEqual({ id: "pool", name: "KBank account", limit: 700_000 });
});

test("puts the editor in the row being edited rather than above the table", async () => {
	const element = await mount();
	await startEditing(element, "solo");

	const row = editingRow(element);
	expect(row).not.toBeNull();
	expect(row?.querySelector<HTMLInputElement>('[name="editName"]')?.value).toBe(
		"SCB",
	);
	expect(
		row?.querySelector<HTMLInputElement>('[name="editLimit"]')?.value,
	).toBe("1000");
	// The row it replaced is the one that was clicked, in its own place in the table.
	const rows = [...(element.shadowRoot?.querySelectorAll("tbody tr") ?? [])];
	expect(rows.indexOf(row as Element)).toBe(1);
});

test("leaves the add form alone while a row is being edited", async () => {
	const element = await mount();
	await startEditing(element, "pool");

	const add = element.shadowRoot?.querySelector('form[data-form="add"]');
	expect(
		add?.querySelector<HTMLInputElement>('[name="groupName"]')?.value,
	).toBe("");
	expect(add?.textContent).toContain("Add limit group");
	expect(add?.querySelector('[name="editName"]')).toBeNull();
});

test("cancelling puts the row back as it was", async () => {
	const element = await mount();
	await startEditing(element, "pool");

	editingRow(element)
		?.querySelector<HTMLButtonElement>('[data-action="cancel"]')
		?.click();
	await element.updateComplete;

	expect(editingRow(element)).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("KBank account");
});

test("an edit that is refused says so in the row, and saves nothing", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("save-group", () => {
		emitted = true;
	});

	await startEditing(element, "pool");
	fill(element, "editName", "");
	submitForm(element, "edit");
	await element.updateComplete;

	expect(emitted).toBe(false);
	const alert = element.shadowRoot?.querySelector('tbody [role="alert"]');
	expect(alert?.textContent).toContain("name");
	// Still editing, so the answer is correctable where it was given.
	expect(editingRow(element)).not.toBeNull();
});

test("editing one group then another moves the editor to the second row", async () => {
	const element = await mount();
	await startEditing(element, "pool");
	await startEditing(element, "solo");

	const rows = [
		...(element.shadowRoot?.querySelectorAll("tr[data-editing]") ?? []),
	];
	expect(rows).toHaveLength(1);
	expect(
		rows[0]?.querySelector<HTMLInputElement>('[name="editName"]')?.value,
	).toBe("SCB");
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
