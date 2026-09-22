import { expect, test } from "bun:test";
import "#components/cc-card-form";
import type { Card } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

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
	fill(element, "location", "krabi");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
	submit(element);

	expect(saved).toEqual({
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "krabi",
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
	fill(element, "location", "bangkok");
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
	fill(element, "location", "krabi");
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
	fill(element, "location", "krabi");
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
	// A <select> always holds one of its option values -- unlike the free-text input it
	// replaced, it can't clear to "". It reverts to the first option, "bangkok".
	expect(value("location")).toBe("bangkok");
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
	fill(element, "location", "bangkok");
	fill(element, "closeDay", "20");
	fill(element, "dueOffsetDays", "10");
	submit(element);

	expect(saves).toHaveLength(2);
	expect(saves[1]).toEqual({
		id: "scb",
		name: "SCB Mastercard",
		last4: "1234",
		location: "bangkok",
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
		location: "krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
	});
	expect(element.shadowRoot?.querySelector('[name="id"]')).toBeNull();
	expect(element.shadowRoot?.textContent).toContain("kbank");
});

test("offers exactly the three locations, labelled", async () => {
	const element = await mount();
	const options = [
		...(element.shadowRoot?.querySelectorAll<HTMLOptionElement>(
			'[name="location"] option',
		) ?? []),
	];

	expect(options.map((option) => option.value)).toEqual([
		"bangkok",
		"phichit",
		"krabi",
	]);
	expect(options.map((option) => option.textContent?.trim())).toEqual([
		"Bangkok",
		"Phichit",
		"Krabi",
	]);
});

test("defaults a new card to Bangkok without the user touching the field", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "4821");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
	submit(element);

	expect(saved?.location).toBe("bangkok");
});

test("shows the edited card's own location when editing", async () => {
	const element = await mount({
		id: "scb",
		name: "SCB",
		last4: "1234",
		location: "phichit",
		cycle: { kind: "fixed", closeDay: 18, dueDay: 5 },
		archived: false,
	});

	const select =
		element.shadowRoot?.querySelector<HTMLSelectElement>('[name="location"]');
	expect(select?.value).toBe("phichit");
});

test("renders its labels and location options in the chosen language", async () => {
	setLocale("en");
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Add card");
	expect(element.shadowRoot?.textContent).toContain("Bangkok");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("เพิ่มบัตร");
	expect(element.shadowRoot?.textContent).toContain("กรุงเทพฯ");
});
