import { expect, test } from "bun:test";
import "#components/cc-card-form";
import type { CcCardForm } from "#components/cc-card-form";
import type { Card, LimitGroup } from "#lib/domain/types";
import { setLocale } from "#lib/i18n/index";

const groups: LimitGroup[] = [
	{ id: "pool", name: "KBank account", limit: 500_000 },
];

const stored = (extra: Partial<Card> = {}): Card => ({
	id: "kbank",
	name: "KBank Visa",
	last4: "4821",
	location: "krabi",
	cycle: { kind: "offset", closeDay: 18, dueOffsetDays: 15 },
	archived: false,
	limitGroupId: "pool",
	...extra,
});

const mount = async (
	card: Card | null = null,
	limitGroups = groups,
	extra: Partial<CcCardForm> = {},
) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-card-form");
	element.card = card;
	element.groups = limitGroups;
	Object.assign(element, extra);
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const $ = <T extends Element = HTMLElement>(
	element: HTMLElement,
	selector: string,
) => element.shadowRoot?.querySelector<T>(selector) ?? null;

const fill = (element: HTMLElement, name: string, value: string) => {
	const field = $<HTMLInputElement>(element, `[name="${name}"]`);
	if (!field) throw new Error(`no field named ${name}`);
	field.value = value;
	field.dispatchEvent(new Event("input", { bubbles: true }));
};

const press = async (element: CcCardForm, selector: string) => {
	const button = $<HTMLButtonElement>(element, selector);
	if (!button) throw new Error(`no button ${selector}`);
	button.click();
	await element.updateComplete;
};

const pickLocation = (element: CcCardForm, location: string) =>
	press(element, `[data-location="${location}"]`);

const holder = async (element: CcCardForm, value: string) => {
	fill(element, "holder", value);
	await element.updateComplete;
};

/** Every field a valid offset-rule card needs, except the limit group. */
const fillCard = async (element: CcCardForm) => {
	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "4821");
	await pickLocation(element, "krabi");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
};

const submit = async (element: CcCardForm) => {
	$(element, "form")?.dispatchEvent(
		new Event("submit", { bubbles: true, cancelable: true }),
	);
	await element.updateComplete;
};

const onSave = (element: HTMLElement) => {
	const saves: Card[] = [];
	element.addEventListener("save", (event) =>
		saves.push((event as CustomEvent<Card>).detail),
	);
	return saves;
};

test("refuses to save a card with no limit group", async () => {
	const element = await mount();
	const saves = onSave(element);

	await fillCard(element);
	await submit(element);

	expect(saves).toHaveLength(0);
	expect(element.shadowRoot?.textContent).toContain("limit group");
});

test("carries the chosen limit group in the saved card", async () => {
	const element = await mount();
	const saves = onSave(element);

	await fillCard(element);
	fill(element, "limitGroupId", "pool");
	await submit(element);

	expect(saves[0]?.limitGroupId).toBe("pool");
});

test("opens an existing card on its stored group", async () => {
	const element = await mount(stored());
	expect($<HTMLSelectElement>(element, '[name="limitGroupId"]')?.value).toBe(
		"pool",
	);
});

test("keeps the chosen limit group in place when the group list reshapes under the open form", async () => {
	const threeGroups: LimitGroup[] = [
		{ id: "a", name: "Group A", limit: 100_000 },
		{ id: "b", name: "Group B", limit: 200_000 },
		{ id: "c", name: "Group C", limit: 300_000 },
	];
	const element = await mount(null, threeGroups);

	fill(element, "limitGroupId", "b");
	await element.updateComplete;

	// A fourth group lands ahead of "b": the options render from an unkeyed map, so the
	// browser's own selection would drift onto "d" with no event at all.
	element.groups = [
		threeGroups[0] as LimitGroup,
		{ id: "d", name: "Group D", limit: 400_000 },
		threeGroups[1] as LimitGroup,
		threeGroups[2] as LimitGroup,
	];
	await element.updateComplete;
	expect($<HTMLSelectElement>(element, '[name="limitGroupId"]')?.value).toBe(
		"b",
	);

	// "b" is deleted outright: back to the placeholder, not whatever sits in its old slot.
	element.groups = [threeGroups[0] as LimitGroup, threeGroups[2] as LimitGroup];
	await element.updateComplete;
	expect($<HTMLSelectElement>(element, '[name="limitGroupId"]')?.value).toBe(
		"",
	);
});

test("disables the group select when no group exists", async () => {
	const element = await mount(null, []);
	expect($<HTMLSelectElement>(element, '[name="limitGroupId"]')?.disabled).toBe(
		true,
	);
});

test("names each group as name (holder) · limit, by holder then name", async () => {
	const element = await mount(null, [
		{ id: "pool", name: "KBank account", limit: 500_000_00, owner: "NT" },
		{ id: "solo", name: "SCB", limit: 100_000_00 },
	]);
	const options = [
		...(element.shadowRoot?.querySelectorAll<HTMLOptionElement>(
			'[name="limitGroupId"] option',
		) ?? []),
	].slice(1);
	expect(options.map((option) => option.textContent?.trim())).toEqual([
		"SCB (KC) · ฿100,000.00",
		"KBank account (NT) · ฿500,000.00",
	]);
});

test("emits a complete card with an offset rule", async () => {
	const element = await mount();
	const saves = onSave(element);

	await fillCard(element);
	fill(element, "limitGroupId", "pool");
	await submit(element);

	expect(saves[0]).toEqual({
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

test("emits a fixed rule when that kind is chosen", async () => {
	const element = await mount();
	const saves = onSave(element);

	await press(element, '[data-kind="fixed"]');
	expect($(element, '[data-kind="fixed"]')?.getAttribute("aria-pressed")).toBe(
		"true",
	);
	fill(element, "id", "scb");
	fill(element, "name", "SCB Mastercard");
	fill(element, "last4", "1234");
	fill(element, "closeDay", "18");
	fill(element, "dueDay", "5");
	fill(element, "limitGroupId", "pool");
	await submit(element);

	expect(saves[0]?.cycle).toEqual({ kind: "fixed", closeDay: 18, dueDay: 5 });
});

test("names the account holder from the chosen group, and asks for a holder only for a supplementary card", async () => {
	const element = await mount(null, [
		{ id: "nt", name: "NT pool", limit: 1, owner: "NT" },
	]);
	const account = () =>
		$<HTMLOptionElement>(element, '[name="holder"] option[value="account"]')
			?.textContent;
	expect(account()).toContain("Account holder (KC)");
	fill(element, "limitGroupId", "nt");
	await element.updateComplete;
	expect(account()).toContain("Account holder (NT)");

	expect($(element, '[name="owner"]')).toBeNull();
	await holder(element, "supplementary");
	const options = [
		...(element.shadowRoot?.querySelectorAll<HTMLOptionElement>(
			'[name="owner"] option',
		) ?? []),
	].map((option) => option.value);
	expect(options).toEqual(["", "KC", "NT", "RI"]);

	await holder(element, "account");
	expect($(element, '[name="owner"]')).toBeNull();
});

test("refuses a supplementary card with no holder chosen", async () => {
	const element = await mount();
	const saves = onSave(element);

	await holder(element, "supplementary");
	await fillCard(element);
	fill(element, "limitGroupId", "pool");
	await submit(element);

	expect(saves).toHaveLength(0);
	expect(element.shadowRoot?.textContent).toContain(
		"Choose who holds this supplementary card.",
	);
});

test("saves the holder of a supplementary card", async () => {
	const element = await mount();
	const saves = onSave(element);

	await holder(element, "supplementary");
	await fillCard(element);
	fill(element, "limitGroupId", "pool");
	fill(element, "owner", "NT");
	await submit(element);

	expect(saves[0]?.supplementary).toBe(true);
	expect(saves[0]?.owner).toBe("NT");
});

test("a stored group that no longer exists falls back to the placeholder", async () => {
	const element = await mount(stored());
	element.card = stored({ id: "other", limitGroupId: "gone" });
	await element.updateComplete;
	// Tracked state, not the select's shown value: a select with no matching option shows blank
	// either way, but a later render would write the stale id back.
	expect((element as unknown as { groupId: string }).groupId).toBe("");
});

test("drops the owner once the card is no longer supplementary", async () => {
	const element = await mount(stored({ supplementary: true, owner: "NT" }));
	const saves = onSave(element);

	await holder(element, "account");
	await submit(element);

	expect(saves[0]?.supplementary).toBe(false);
	expect(saves[0] && "owner" in saves[0]).toBe(false);
});

test("shows the edited card's supplementary answer and holder, and saves them back untouched", async () => {
	const element = await mount(stored({ supplementary: true, owner: "RI" }));
	const saves = onSave(element);

	expect($<HTMLSelectElement>(element, '[name="holder"]')?.value).toBe(
		"supplementary",
	);
	expect($<HTMLSelectElement>(element, '[name="owner"]')?.value).toBe("RI");

	await submit(element);
	expect(saves[0]?.supplementary).toBe(true);
	expect(saves[0]?.owner).toBe("RI");
});

test("refuses a last4 that is not four digits", async () => {
	const element = await mount();
	const saves = onSave(element);

	await fillCard(element);
	fill(element, "last4", "48");
	fill(element, "limitGroupId", "pool");
	await submit(element);

	expect(saves).toHaveLength(0);
	expect(element.shadowRoot?.textContent).toContain("four digits");
});

test("re-renders a displayed error in the new language when the locale switches", async () => {
	const element = await mount();

	await fillCard(element);
	fill(element, "last4", "48");
	await submit(element);
	expect(element.shadowRoot?.textContent).toContain(
		"Last 4 must be exactly four digits.",
	);

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain(
		"เลข 4 ตัวท้ายต้องเป็นตัวเลขสี่หลัก",
	);
	setLocale("en");
});

test("shows a four-digit example in the id field", async () => {
	const element = await mount();
	expect($<HTMLInputElement>(element, '[name="id"]')?.placeholder).toBe("0001");
});

test("shows the id of a saved card disabled, and saves under it", async () => {
	const element = await mount(stored());
	const saves = onSave(element);

	const id = $<HTMLInputElement>(element, '[name="id"]');
	expect(id?.disabled).toBe(true);
	expect(id?.value).toBe("kbank");
	// The page's sub-header says the id can't change; the form does not repeat it.
	expect(element.shadowRoot?.textContent).not.toContain("Card id can't change");

	fill(element, "name", "Renamed");
	await submit(element);
	expect(saves[0]?.id).toBe("kbank");
	expect(saves[0]?.name).toBe("Renamed");
});

test("offers the locations as a segmented control, labelled, Bangkok first", async () => {
	const element = await mount();
	const buttons = [
		...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>(
			".seg [data-location]",
		) ?? []),
	];
	expect(buttons.map((button) => button.dataset["location"])).toEqual([
		"bangkok",
		"phichit",
		"krabi",
	]);
	expect(buttons.map((button) => button.textContent?.trim())).toEqual([
		"Bangkok",
		"Phichit",
		"Krabi",
	]);
	expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
		"true",
		"false",
		"false",
	]);
});

test("defaults a new card to Bangkok without the user touching the field", async () => {
	const element = await mount();
	const saves = onSave(element);

	fill(element, "id", "kbank");
	fill(element, "name", "KBank Visa");
	fill(element, "last4", "4821");
	fill(element, "closeDay", "18");
	fill(element, "dueOffsetDays", "15");
	fill(element, "limitGroupId", "pool");
	await submit(element);

	expect(saves[0]?.location).toBe("bangkok");
});

test("shows the edited card's own location pressed", async () => {
	const element = await mount(stored({ location: "phichit" }));
	expect(
		$(element, '[data-location="phichit"]')?.getAttribute("aria-pressed"),
	).toBe("true");
});

test("renders its labels and locations in the chosen language", async () => {
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Add card");
	expect(element.shadowRoot?.textContent).toContain("Bangkok");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("เพิ่มบัตร");
	expect(element.shadowRoot?.textContent).toContain("กรุงเทพฯ");
	setLocale("en");
});

test("keeps what was typed when the page hands back a fresh copy of the same card", async () => {
	const element = await mount(stored());
	fill(element, "name", "Typed");
	element.card = stored();
	await element.updateComplete;
	expect($<HTMLInputElement>(element, '[name="name"]')?.value).toBe("Typed");
});

test("a new card has no archive, no delete and no cancel -- the back header leaves", async () => {
	const element = await mount();
	expect($(element, '[data-action="archive"]')).toBeNull();
	expect($(element, '[data-action="delete-card"]')).toBeNull();
	expect($(element, '[data-action="cancel"]')).toBeNull();
	expect($(element, 'button[type="submit"]')?.textContent?.trim()).toBe(
		"Add card",
	);
});

test("editing saves changes, with no Archive or Delete -- they live on the card page", async () => {
	const element = await mount(stored());
	expect($(element, 'button[type="submit"]')?.textContent?.trim()).toBe(
		"Save changes",
	);
	expect($(element, '[data-action="archive"]')).toBeNull();
	expect($(element, '[data-action="delete-card"]')).toBeNull();
	expect(element.shadowRoot?.textContent).not.toContain("Archive card");
	expect(element.shadowRoot?.textContent).not.toContain("Delete card");
});

test("groups the fields in sections: Card, Where and who, Billing cycle, Comment, then Save", async () => {
	const element = await mount(stored());
	const sections = [
		...(element.shadowRoot?.querySelectorAll("form > section") ?? []),
	];
	expect(
		sections.map((section) => section.querySelector("h2")?.textContent?.trim()),
	).toEqual(["Card", "Where and who", "Billing cycle", "Comment"]);
	const names = (section: Element | undefined) =>
		[
			...(section?.querySelectorAll("[name], [data-location], [data-kind]") ??
				[]),
		].map(
			(field) =>
				field.getAttribute("name") ??
				(field.hasAttribute("data-location") ? "location" : "kind"),
		);
	expect(names(sections[0])).toEqual(["name", "id", "last4"]);
	expect([...new Set(names(sections[1]))]).toEqual([
		"location",
		"limitGroupId",
		"holder",
	]);
	expect([...new Set(names(sections[2]))]).toEqual([
		"kind",
		"closeDay",
		"dueOffsetDays",
	]);
	expect(names(sections[3])).toEqual(["comment"]);
	// Each section is named by its heading.
	for (const section of sections) {
		const id = section.getAttribute("aria-labelledby");
		expect(id && section.querySelector(`#${id}`)?.tagName).toBe("H2");
	}
	// Save closes the form, after the last section.
	const form = $(element, "form");
	expect(
		form?.lastElementChild?.querySelector('button[type="submit"]'),
	).not.toBeNull();
});

test("shows the page's reason a write failed, and holds the buttons while busy", async () => {
	const element = await mount(stored(), groups, {
		error: "Could not save the card.",
		busy: true,
	});
	expect(
		$<HTMLElement & { message: string }>(element, "cc-error-banner")?.message,
	).toBe("Could not save the card.");
	expect($<HTMLButtonElement>(element, 'button[type="submit"]')?.disabled).toBe(
		true,
	);
});
