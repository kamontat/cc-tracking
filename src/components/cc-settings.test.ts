import { expect, test } from "bun:test";
import "#components/cc-settings";
import { DEFAULT_SETTINGS, type Settings } from "#lib/domain/settings";
import { setLocale } from "#lib/i18n/index";

const mount = async (settings: Settings = DEFAULT_SETTINGS) => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-settings");
	element.settings = settings;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const box = (element: HTMLElement, location: string) =>
	element.shadowRoot?.querySelector<HTMLInputElement>(
		`[data-location="${location}"]`,
	);

test("offers one box per location, ticked for the ones that take purchases", async () => {
	const element = await mount();
	const boxes = [
		...(element.shadowRoot?.querySelectorAll<HTMLInputElement>(
			"[data-location]",
		) ?? []),
	];

	expect(boxes.map((input) => input.getAttribute("data-location"))).toEqual([
		"bangkok",
		"phichit",
		"krabi",
	]);
	expect(boxes.map((input) => input.checked)).toEqual([false, false, true]);
});

test("ticking a location emits the settings with it added", async () => {
	const element = await mount();
	let saved: Settings | undefined;
	element.addEventListener("save-settings", (event) => {
		saved = (event as CustomEvent<Settings>).detail;
	});

	box(element, "bangkok")?.click();

	expect(saved?.purchaseLocations).toContain("bangkok");
	expect(saved?.purchaseLocations).toContain("krabi");
});

test("unticking a location emits the settings with it removed", async () => {
	const element = await mount();
	let saved: Settings | undefined;
	element.addEventListener("save-settings", (event) => {
		saved = (event as CustomEvent<Settings>).detail;
	});

	box(element, "krabi")?.click();

	expect(saved?.purchaseLocations).toEqual([]);
});

test("emits nothing for a location that was already in the state clicked to", async () => {
	const element = await mount({ purchaseLocations: [] });
	expect(box(element, "krabi")?.checked).toBe(false);
});

test("renders its heading and location labels in the chosen language", async () => {
	const element = await mount();
	expect(element.shadowRoot?.textContent).toContain("Purchases");
	expect(element.shadowRoot?.textContent).toContain("Krabi");

	setLocale("th");
	await element.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("กระบี่");
});

test("warns when nothing anywhere may take a purchase", async () => {
	const element = await mount({ purchaseLocations: [] });
	expect(
		element.shadowRoot?.querySelector('[data-testid="none-allowed"]'),
	).not.toBeNull();

	const withOne = await mount();
	expect(
		withOne.shadowRoot?.querySelector('[data-testid="none-allowed"]'),
	).toBeNull();
});
