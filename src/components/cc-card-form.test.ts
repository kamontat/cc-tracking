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

const tickSupplementary = (element: HTMLElement) =>
	element.shadowRoot
		?.querySelector<HTMLInputElement>('[name="supplementary"]')
		?.click();

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

test("keeps the chosen limit group in place when the group list reshapes under the open form", async () => {
	const threeGroups: LimitGroup[] = [
		{ id: "a", name: "Group A", limit: 100_000 },
		{ id: "b", name: "Group B", limit: 200_000 },
		{ id: "c", name: "Group C", limit: 300_000 },
	];
	const element = await mount(null, threeGroups);

	const select = element.shadowRoot?.querySelector<HTMLSelectElement>(
		'[name="limitGroupId"]',
	);
	if (!select) throw new Error("no limit group select");
	select.value = "b";
	select.dispatchEvent(new Event("change", { bubbles: true }));
	await element.updateComplete;

	// A fourth group is inserted ahead of "b", so a group named "d" now occupies the array
	// position "b" used to hold. The options render from an unkeyed map, so without a fix Lit
	// patches the existing <option> nodes positionally and the browser's native selection
	// silently lands on "d" -- no `change` event fires -- while the user actually chose "b".
	element.groups = [
		threeGroups[0] as LimitGroup,
		{ id: "d", name: "Group D", limit: 400_000 },
		threeGroups[1] as LimitGroup,
		threeGroups[2] as LimitGroup,
	];
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector<HTMLSelectElement>(
			'[name="limitGroupId"]',
		)?.value,
	).toBe("b");

	// "b" is now deleted outright, with nothing left behind at its old slot -- the selection
	// must fall back to the empty placeholder, not silently adopt whatever group ends up there.
	element.groups = [threeGroups[0] as LimitGroup, threeGroups[2] as LimitGroup];
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector<HTMLSelectElement>(
			'[name="limitGroupId"]',
		)?.value,
	).toBe("");
});

test("disables the selector, without a note, when no group exists", async () => {
	const element = await mount(null, []);
	const field = element.shadowRoot?.querySelector<HTMLSelectElement>(
		'[name="limitGroupId"]',
	);
	expect(field?.disabled).toBe(true);
	expect(field?.closest("label")?.querySelector("small")).toBeNull();
});

test("keeps the holder with the supplementary box, the box standing as its label", async () => {
	const element = await mount();
	tickSupplementary(element);
	await element.updateComplete;

	const field = element.shadowRoot?.querySelector(".supplementary-field");
	expect(field?.querySelector('[name="supplementary"]')).not.toBeNull();
	const owner = field?.querySelector<HTMLSelectElement>('[name="owner"]');
	expect(owner?.getAttribute("aria-label")).toBe("Card holder");
	expect(field?.querySelector("small")).toBeNull();
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
		supplementary: false,
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		comment: "",
		archived: false,
		limitGroupId: "pool",
	});
});

test("starts closed and titles itself, opening when a card arrives to edit", async () => {
	const element = await mount();
	const section =
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details");
	expect(section?.open).toBe(false);
	expect(element.shadowRoot?.querySelector("summary")?.textContent).toContain(
		"Add a card",
	);

	element.card = {
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "krabi",
		supplementary: false,
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
	};
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector<HTMLDetailsElement>("details")?.open,
	).toBe(true);
	expect(element.shadowRoot?.querySelector("summary")?.textContent).toContain(
		"KBank Visa",
	);
});

test("asks whose card it is only for a supplementary card -- otherwise the group answers", async () => {
	const element = await mount();
	expect(element.shadowRoot?.querySelector('[name="owner"]')).toBeNull();

	tickSupplementary(element);
	await element.updateComplete;
	const options = [
		...(element.shadowRoot?.querySelectorAll<HTMLOptionElement>(
			'[name="owner"] option',
		) ?? []),
	].map((option) => option.value);
	expect(options).toEqual(["", "KC", "NT", "RI"]);

	tickSupplementary(element);
	await element.updateComplete;
	expect(element.shadowRoot?.querySelector('[name="owner"]')).toBeNull();
});

test("refuses a supplementary card with no owner chosen", async () => {
	const element = await mount();
	let emitted = false;
	element.addEventListener("save", () => {
		emitted = true;
	});

	tickSupplementary(element);
	await element.updateComplete;
	fillCard(element);
	fill(element, "limitGroupId", "pool");
	submit(element);
	await element.updateComplete;

	expect(emitted).toBe(false);
	expect(element.shadowRoot?.textContent).toContain(
		"Choose who holds this supplementary card.",
	);
});

test("saves the holder of a supplementary card", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	tickSupplementary(element);
	await element.updateComplete;
	fillCard(element);
	fill(element, "limitGroupId", "pool");
	fill(element, "owner", "NT");
	submit(element);

	expect(saved?.supplementary).toBe(true);
	expect(saved?.owner).toBe("NT");
});

test("drops the owner once the card is no longer supplementary", async () => {
	const element = await mount({
		id: "a2",
		name: "Card A",
		last4: "2222",
		location: "krabi",
		supplementary: true,
		owner: "NT",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
		limitGroupId: "pool",
	});
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	tickSupplementary(element);
	await element.updateComplete;
	submit(element);

	expect(saved?.supplementary).toBe(false);
	expect(saved && "owner" in saved).toBe(false);
});

test("names each group with its owner in the picker", async () => {
	const element = await mount(null, [
		{ id: "pool", name: "KBank account", limit: 500_000, owner: "NT" },
		{ id: "solo", name: "SCB", limit: 100_000 },
	]);
	const labels = [
		...(element.shadowRoot?.querySelectorAll<HTMLOptionElement>(
			'[name="limitGroupId"] option',
		) ?? []),
	]
		.slice(1)
		.map((option) => option.textContent?.trim());
	expect(labels).toEqual(["SCB (KC)", "KBank account (NT)"]);
});

test("lists groups in the picker by owner, then by name", async () => {
	const element = await mount(null, [
		{ id: "ri", name: "Alpha", limit: 1, owner: "RI" },
		{ id: "kz", name: "Zulu", limit: 1, owner: "KC" },
		{ id: "nt", name: "Mike", limit: 1, owner: "NT" },
		{ id: "ka", name: "Alpha", limit: 1, owner: "KC" },
	]);
	const values = [
		...(element.shadowRoot?.querySelectorAll<HTMLOptionElement>(
			'[name="limitGroupId"] option',
		) ?? []),
	].map((option) => option.value);
	expect(values).toEqual(["", "ka", "kz", "nt", "ri"]);
});

test("saves a card with no owner field at all", async () => {
	const element = await mount();
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	fillCard(element);
	fill(element, "limitGroupId", "pool");
	submit(element);

	expect(saved).not.toBeUndefined();
	expect(saved && "owner" in saved).toBe(false);
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
		supplementary: false,
		cycle: { kind: "offset", closeDay: 20, dueOffsetDays: 10 },
		comment: "",
		archived: false,
		limitGroupId: "pool",
	});
});

test("shows a four-digit example in the id field, in both languages", async () => {
	setLocale("en");
	const element = await mount();
	const field =
		element.shadowRoot?.querySelector<HTMLInputElement>('[name="id"]');
	expect(field?.placeholder).toBe("0001");

	setLocale("th");
	await element.updateComplete;
	expect(
		element.shadowRoot?.querySelector<HTMLInputElement>('[name="id"]')
			?.placeholder,
	).toBe("0001");
});

test("the locked id reads as a field, its label above its value like every other one", async () => {
	setLocale("en");
	const element = await mount({
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
	});

	const field = element.shadowRoot?.querySelector('[data-field="id"]');
	expect(field?.querySelector(".readonly__label")?.textContent?.trim()).toBe(
		"Id",
	);
	const value = field?.querySelector(".readonly__value");
	expect(value?.textContent).toContain("kbank");
	expect(value?.textContent).toContain("cannot change");
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

test("no longer asks whether the card may take purchases -- that moved to settings", async () => {
	const element = await mount();
	expect(element.shadowRoot?.querySelector('[name="canPurchase"]')).toBeNull();
});

test("saves a card as supplementary only when the box is ticked", async () => {
	const element = await mount();
	const saves: Card[] = [];
	element.addEventListener("save", (event) => {
		saves.push((event as CustomEvent<Card>).detail);
	});

	fillCard(element);
	fill(element, "limitGroupId", "pool");
	submit(element);
	await element.updateComplete;
	expect(saves[0]?.supplementary).toBe(false);

	element.shadowRoot
		?.querySelector<HTMLInputElement>('[name="supplementary"]')
		?.click();
	await element.updateComplete;
	fillCard(element);
	fill(element, "limitGroupId", "pool");
	fill(element, "owner", "NT");
	submit(element);

	expect(saves[1]?.supplementary).toBe(true);
});

test("shows the edited card's supplementary answer and holder, and saves them back untouched", async () => {
	const element = await mount({
		id: "scb",
		name: "SCB",
		last4: "1234",
		location: "bangkok",
		supplementary: true,
		owner: "RI",
		cycle: { kind: "fixed", closeDay: 18, dueDay: 5 },
		archived: false,
	});
	let saved: Card | undefined;
	element.addEventListener("save", (event) => {
		saved = (event as CustomEvent<Card>).detail;
	});

	expect(
		element.shadowRoot?.querySelector<HTMLInputElement>(
			'[name="supplementary"]',
		)?.checked,
	).toBe(true);

	expect(
		element.shadowRoot?.querySelector<HTMLSelectElement>('[name="owner"]')
			?.value,
	).toBe("RI");

	fill(element, "limitGroupId", "pool");
	submit(element);
	expect(saved?.supplementary).toBe(true);
	expect(saved?.owner).toBe("RI");
});

test("clears the supplementary box after a create", async () => {
	const element = await mount();
	const saves: Card[] = [];
	element.addEventListener("save", (event) => {
		saves.push((event as CustomEvent<Card>).detail);
	});

	element.shadowRoot
		?.querySelector<HTMLInputElement>('[name="supplementary"]')
		?.click();
	await element.updateComplete;
	fillCard(element);
	fill(element, "limitGroupId", "pool");
	fill(element, "owner", "NT");
	submit(element);
	await element.updateComplete;

	expect(saves).toHaveLength(1);
	expect(
		element.shadowRoot?.querySelector<HTMLInputElement>(
			'[name="supplementary"]',
		)?.checked,
	).toBe(false);
	expect(element.shadowRoot?.querySelector('[name="owner"]')).toBeNull();

	// Ticked again for the next card, the holder starts blank rather than carrying NT over.
	tickSupplementary(element);
	await element.updateComplete;
	expect(
		element.shadowRoot?.querySelector<HTMLSelectElement>('[name="owner"]')
			?.value,
	).toBe("");
});

test("offers no cancel while adding a card", async () => {
	const element = await mount();

	expect(
		element.shadowRoot?.querySelector('button[data-action="cancel"]'),
	).toBeNull();
});

test("renders cancel as a quiet button beside the submit", async () => {
	const element = await mount({
		id: "kbank",
		name: "KBank Visa",
		last4: "4821",
		location: "krabi",
		cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
		archived: false,
	});

	expect(
		element.shadowRoot?.querySelector('button[type="submit"]'),
	).not.toBeNull();
	expect(
		element.shadowRoot?.querySelector('button[data-variant="quiet"]')
			?.textContent,
	).toContain("Cancel");
});
