import { beforeEach, expect, test } from "bun:test";
import "#components/cc-display-settings";
import { getLocale, resetLocale, setLocale } from "#lib/i18n/index";

beforeEach(() => {
	globalThis.localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	resetLocale();
	setLocale("en");
});

const mount = async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-display-settings");
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const select = (element: HTMLElement, name: string) => {
	const found = element.shadowRoot?.querySelector<HTMLSelectElement>(
		`select[name="${name}"]`,
	);
	if (!found) throw new Error(`no ${name} select`);
	return found;
};

const pick = (target: HTMLSelectElement, value: string) => {
	target.value = value;
	target.dispatchEvent(new Event("change", { bubbles: true }));
};

test("offers both languages and shows the current one", async () => {
	const element = await mount();
	const language = select(element, "language");

	expect([...language.options].map((option) => option.value)).toEqual([
		"en",
		"th",
	]);
	expect(language.value).toBe("en");
});

test("switching the language picker changes the locale and persists it", async () => {
	const element = await mount();
	pick(select(element, "language"), "th");

	expect(getLocale()).toBe("th");
	expect(globalThis.localStorage.getItem("cc:lang")).toBe("th");
});

test("the language picker follows a locale change made elsewhere", async () => {
	const element = await mount();
	setLocale("th");
	await element.updateComplete;

	expect(select(element, "language").value).toBe("th");
});

test("offers the device, light and dark themes, starting on the device", async () => {
	const element = await mount();
	const theme = select(element, "theme");

	expect([...theme.options].map((option) => option.value)).toEqual([
		"system",
		"light",
		"dark",
	]);
	expect(theme.value).toBe("system");
	expect(theme.options[0]?.textContent?.trim()).toBe("Match device");
});

test("switching the theme picker stamps the root and persists it", async () => {
	const element = await mount();
	pick(select(element, "theme"), "dark");

	expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
	expect(globalThis.localStorage.getItem("cc:theme")).toBe("dark");
});

test("shows a saved theme on a fresh mount", async () => {
	globalThis.localStorage.setItem("cc:theme", "light");
	const element = await mount();

	expect(select(element, "theme").value).toBe("light");
});
