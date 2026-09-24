import { expect, test } from "bun:test";
import type { CcLimitGroupForm } from "#components/cc-limit-group-form";
import "#components/cc-limit-group-form";
import type { LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const mount = async (group: LimitGroup | null = null) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-limit-group-form");
	element.group = group;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const field = (element: CcLimitGroupForm, name: string) => {
	const input = element.shadowRoot?.querySelector<HTMLInputElement>(
		`[name="${name}"]`,
	);
	if (!input) throw new Error(`no field named ${name}`);
	return input;
};

const fill = (element: CcLimitGroupForm, name: string, value: string) => {
	const input = field(element, name);
	input.value = value;
	input.dispatchEvent(new Event("input", { bubbles: true }));
};

const submit = (element: CcLimitGroupForm) =>
	element.shadowRoot
		?.querySelector("form")
		?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

const details = (element: CcLimitGroupForm) =>
	element.shadowRoot?.querySelector<HTMLDetailsElement>("details");

const saved = (element: CcLimitGroupForm) => {
	const seen: LimitGroup[] = [];
	element.addEventListener("save-group", (event) => {
		seen.push((event as CustomEvent<LimitGroup>).detail);
	});
	return seen;
};

test("mints an id for a group being created", async () => {
	const element = await mount();
	const seen = saved(element);

	fill(element, "name", "TTB account");
	fill(element, "limit", "3000");
	submit(element);

	expect(seen[0]?.name).toBe("TTB account");
	expect(seen[0]?.limit).toBe(300_000);
	expect(seen[0]?.owner).toBe("KC");
	expect(seen[0]?.id).toBeTruthy();
});

test("keeps the id and carries the chosen owner when editing", async () => {
	const element = await mount({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	const seen = saved(element);

	expect(field(element, "name").value).toBe("KBank account");
	expect(field(element, "limit").value).toBe("5000");
	fill(element, "owner", "RI");
	submit(element);

	expect(seen[0]).toEqual({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
		owner: "RI",
	});
});

test("shows the owner the edited group already has", async () => {
	const element = await mount({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
		owner: "NT",
	});
	expect(field(element, "owner").value).toBe("NT");
});

test("moves to the second group when one edit follows another", async () => {
	const element = await mount({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	element.group = { id: "solo", name: "SCB", limit: 100_000, owner: "RI" };
	await element.updateComplete;

	expect(field(element, "name").value).toBe("SCB");
	expect(field(element, "limit").value).toBe("1000");
	expect(field(element, "owner").value).toBe("RI");
});

test("refuses a group with no name, and saves nothing", async () => {
	const element = await mount();
	const seen = saved(element);

	fill(element, "limit", "3000");
	submit(element);
	await element.updateComplete;

	expect(seen).toHaveLength(0);
	expect(
		element.shadowRoot?.querySelector('[role="alert"]')?.textContent,
	).toContain("name");
});

test("refuses a limit that is not an amount, and saves nothing", async () => {
	const element = await mount();
	const seen = saved(element);

	fill(element, "name", "TTB");
	fill(element, "limit", "lots");
	submit(element);
	await element.updateComplete;

	expect(seen).toHaveLength(0);
	expect(
		element.shadowRoot?.querySelector('[role="alert"]')?.textContent,
	).toContain("limit");
});

test("clears itself after a create so the next group starts empty", async () => {
	const element = await mount();
	fill(element, "name", "TTB account");
	fill(element, "limit", "3000");
	fill(element, "owner", "RI");
	submit(element);
	await element.updateComplete;

	expect(field(element, "name").value).toBe("");
	expect(field(element, "limit").value).toBe("");
	expect(field(element, "owner").value).toBe("KC");
});

test("asks to be closed away again", async () => {
	const element = await mount();
	const cancelled: Event[] = [];
	element.addEventListener("cancel", (event) => cancelled.push(event));

	element.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="cancel"]')
		?.click();

	expect(cancelled).toHaveLength(1);
});

test("starts closed, and opens itself when a group arrives to edit", async () => {
	const element = await mount();
	expect(details(element)?.open).toBe(false);

	element.group = { id: "pool", name: "KBank account", limit: 500_000 };
	await element.updateComplete;

	expect(details(element)?.open).toBe(true);
});

test("stays closed once the reader closes it", async () => {
	const element = await mount({
		id: "pool",
		name: "KBank account",
		limit: 500_000,
	});
	const section = details(element);
	if (!section) throw new Error("no details element");

	section.open = false;
	section.dispatchEvent(new Event("toggle"));
	await element.updateComplete;

	// A repaint that changes nothing about the group must not reopen it.
	element.requestUpdate();
	await element.updateComplete;
	expect(details(element)?.open).toBe(false);
});

test("re-renders a displayed error in the new language when the locale switches", async () => {
	const element = await mount();
	fill(element, "limit", "3000");
	submit(element);
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain(
		"Give the limit group a name.",
	);

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("ตั้งชื่อกลุ่มวงเงิน");
});
