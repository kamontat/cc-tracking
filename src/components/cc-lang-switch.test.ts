import { beforeEach, expect, test } from "bun:test";
import "#components/cc-lang-switch";
import { getLocale, resetLocale, setLocale } from "#lib/i18n/index";

beforeEach(() => {
	globalThis.localStorage.clear();
	resetLocale();
	setLocale("en");
});

const mount = async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-lang-switch");
	document.body.append(element);
	await element.updateComplete;
	return element;
};

test("offers both languages and shows the current one", async () => {
	const element = await mount();
	const select = element.shadowRoot?.querySelector<HTMLSelectElement>("select");

	expect([...(select?.options ?? [])].map((option) => option.value)).toEqual([
		"en",
		"th",
	]);
	expect(select?.value).toBe("en");
});

test("switching the picker changes the locale and persists it", async () => {
	const element = await mount();
	const select = element.shadowRoot?.querySelector<HTMLSelectElement>("select");
	if (!select) throw new Error("no select");

	select.value = "th";
	select.dispatchEvent(new Event("change", { bubbles: true }));

	expect(getLocale()).toBe("th");
	expect(globalThis.localStorage.getItem("cc:lang")).toBe("th");
});

test("a subscribed component re-renders when the locale changes elsewhere", async () => {
	const element = await mount();
	setLocale("th");
	await element.updateComplete;

	const select = element.shadowRoot?.querySelector<HTMLSelectElement>("select");
	expect(select?.value).toBe("th");
});
