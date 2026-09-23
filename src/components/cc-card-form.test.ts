import { expect, test } from "bun:test";
import "#components/cc-card-form";
import type { Card, LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const groups: LimitGroup[] = [
	{ id: "pool", name: "KBank account", limit: 500_000 },
];

const mount = async (card: Card | null = null, limitGroups = groups) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-card-form");
	element.card = card;
	element.groups = limitGroups;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

/** Every field a valid offset-rule card needs, except the limit group. */
const fillCard = (element: HTMLElement) => {
	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "4821");
	fill(element, "location", "krabi");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
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

test("refuses to save a card with no limit group", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("save", () => {
		emitted = true;
	});

	fillCard(element);
	submit(element);
	await element.updateComplete;

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain("limit group");
});

test("carries the chosen limit group in the saved card", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	fillCard(element);
	fill(element, "limitGroupId", "pool");
	submit(element);

	expect(saved?.limitGroupId).toBe("pool");
});

test("opens an existing card on its stored group", async () => {
	const card: Card = {
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
		limitGroupId: "pool",
	};
	const element = await mount(card);
	expect(
		element.shadowRoot?.querySelector<HTMLSelectElement>(
			'[name="limitGroupId"]',
		)?.value,
	).toBe("pool");
});

test("disables the selector and says where to go when no group exists", async () => {
	const element = await mount(null, []);
	const field = element.shadowRoot?.querySelector<HTMLSelectElement>(
		'[name="limitGroupId"]',
	);
	expect(field?.disabled).toBe(true);
	expect(element.shadowRoot?.textContent).toContain("Add a limit group");
});

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
	fill(element, "limitGroupId", "pool");
	submit(element);

	expect(saved).toEqual({
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		comment: "",
		archived: false,
		canPurchase: true,
		limitGroupId: "pool",
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
	fill(element, "limitGroupId", "pool");
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

test("re-renders a displayed error in the new language when the locale switches", async () => {
	setLocale("en");
	const element = await mount();

	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "48");
	fill(element, "location", "krabi");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
	submit(element);
	await element.updateComplete;

	expect(element.shadowRoot?.textContent).toContain(
		"Last 4 must be exactly four digits.",
	);

	setLocale("th");
	await element.updateComplete;

	expect(element.shadowRoot?.textContent).toContain(
		"เลข 4 ตัวท้ายต้องเป็นตัวเลขสี่หลัก",
	);
	expect(element.shadowRoot?.textContent).not.toContain(
		"Last 4 must be exactly four digits.",
	);
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
	fill(element, "limitGroupId", "pool");
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
	fill(element, "limitGroupId", "pool");
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
		canPurchase: false,
		limitGroupId: "pool",
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
	fill(element, "limitGroupId", "pool");
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

test("lets a new card kept at Krabi take purchases without the user ticking anything", async () => {
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
	fill(element, "limitGroupId", "pool");
	submit(element);

	expect(saved?.canPurchase).toBe(true);
});

test("keeps the ticked box when the location changes afterwards", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	const box = element.shadowRoot?.querySelector<HTMLInputElement>(
		'[name="canPurchase"]',
	);
	box?.click();
	await element.updateComplete;

	fill(element, "id", "scb");
	fill(element, "name", "SCB Mastercard");
	fill(element, "last4", "1234");
	fill(element, "location", "phichit");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
	fill(element, "limitGroupId", "pool");
	submit(element);

	expect(saved?.canPurchase).toBe(true);
});

test("shows the edited card's own answer, and saves it back untouched", async () => {
	const element = await mount({
		id: "scb",
		name: "SCB",
		last4: "1234",
		location: "bangkok",
		cycle: { kind: "fixed", closeDay: 18, dueDay: 5 },
		archived: false,
		canPurchase: true,
	});
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	const box = element.shadowRoot?.querySelector<HTMLInputElement>(
		'[name="canPurchase"]',
	);
	expect(box?.checked).toBe(true);

	fill(element, "limitGroupId", "pool");
	submit(element);
	expect(saved?.canPurchase).toBe(true);
});

test("shows a Krabi card that was turned off as turned off", async () => {
	const element = await mount({
		id: "scb",
		name: "SCB",
		last4: "1234",
		location: "krabi",
		cycle: { kind: "fixed", closeDay: 18, dueDay: 5 },
		archived: false,
		canPurchase: false,
	});

	const box = element.shadowRoot?.querySelector<HTMLInputElement>(
		'[name="canPurchase"]',
	);
	expect(box?.checked).toBe(false);
});

test("renders cancel as a quiet button beside the submit", async () => {
	const element = await mount();

	expect(
		element.shadowRoot?.querySelector('button[type="submit"]'),
	).not.toBeNull();
	expect(
		element.shadowRoot?.querySelector('button[data-variant="quiet"]')
			?.textContent,
	).toContain("Cancel");
});
