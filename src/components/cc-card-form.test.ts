import { expect, test } from "bun:test";
import "#components/cc-card-form";
import type { Card } from "#lib/domain/types";

const mount = async (card: Card | null = null) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-card-form");
	element.card = card;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const fill = (element: HTMLElement, name: string, value: string) => {
	const field = element.shadowRoot?.querySelector<HTMLInputElement>(
		`[name="${name}"]`,
	);
	if (!field) throw new Error(`no field named ${name}`);
	field.value = value;
	field.dispatchEvent(new Event("input", { bubbles: true }));
};

const submit = (element: HTMLElement) =>
	element.shadowRoot
		?.querySelector("form")
		?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

test("emits a complete card with an offset rule", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "4821");
	fill(element, "location", "Krabi");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
	submit(element);

	expect(saved).toEqual({
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "Krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		comment: "",
		archived: false,
	});
});

test("emits a fixed rule when that kind is chosen", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	const fixedRadio = element.shadowRoot?.querySelector<HTMLInputElement>(
		'[name="kind"][value="fixed"]',
	);
	fixedRadio?.click();
	await element.updateComplete;

	fill(element, "id", "scb");
	fill(element, "name", "SCB Mastercard");
	fill(element, "last4", "1234");
	fill(element, "location", "Bangkok");
	fill(element, "closeDay", "18");
	fill(element, "dueDay", "5");
	submit(element);

	expect(saved?.cycle).toEqual({ kind: "fixed", closeDay: 18, dueDay: 5 });
});

test("refuses a last4 that is not four digits", async () => {
	const element = await mount();
	let saved = false;
	element.addEventListener("save", () => {
		saved = true;
	});

	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "48");
	fill(element, "location", "Krabi");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
	submit(element);
	await element.updateComplete;

	expect(saved).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("four digits");
});

test("clears the form after a successful create so the next card starts blank", async () => {
	const element = await mount();
	const saves: Card[] = [];
	element.addEventListener("save", (event) => {
		saves.push((event as CustomEvent<Card>).detail);
	});

	const fixedRadio = element.shadowRoot?.querySelector<HTMLInputElement>(
		'[name="kind"][value="fixed"]',
	);
	fixedRadio?.click();
	await element.updateComplete;

	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "4821");
	fill(element, "location", "Krabi");
	fill(element, "closeDay", "18");
	fill(element, "dueDay", "5");
	submit(element);
	await element.updateComplete;

	const value = (name: string) =>
		element.shadowRoot?.querySelector<HTMLInputElement>(`[name="${name}"]`)
			?.value ?? "";
	expect(value("id")).toBe("");
	expect(value("name")).toBe("");
	expect(value("last4")).toBe("");
	expect(value("location")).toBe("");
	expect(value("closeDay")).toBe("");

	const offsetRadio = element.shadowRoot?.querySelector<HTMLInputElement>(
		'[name="kind"][value="offset"]',
	);
	const fixedRadioAfter = element.shadowRoot?.querySelector<HTMLInputElement>(
		'[name="kind"][value="fixed"]',
	);
	expect(offsetRadio?.checked).toBe(true);
	expect(fixedRadioAfter?.checked).toBe(false);

	// A second create, with different values, must emit a second save carrying only
	// those new values -- not any leftover text from the first card.
	fill(element, "id", "scb");
	fill(element, "name", "SCB Mastercard");
	fill(element, "last4", "1234");
	fill(element, "location", "Bangkok");
	fill(element, "closeDay", "20");
	fill(element, "dueOffsetDays", "10");
	submit(element);

	expect(saves).toHaveLength(2);
	expect(saves[1]).toEqual({
		id: "scb",
		name: "SCB Mastercard",
		last4: "1234",
		location: "Bangkok",
		cycle: { kind: "offset", closeDay: 20, dueOffsetDays: 10 },
		comment: "",
		archived: false,
	});
});

test("locks the id when editing an existing card", async () => {
	const element = await mount({
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "Krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
	});
	expect(element.shadowRoot?.querySelector('[name="id"]')).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("kbank");
});
