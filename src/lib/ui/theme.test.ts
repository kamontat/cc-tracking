import { beforeEach, expect, test } from "bun:test";
import { applyTheme, getTheme, setTheme } from "#lib/ui/theme";

beforeEach(() => {
	globalThis.localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
});

test("follows the device until the reader picks a theme", () => {
	expect(getTheme()).toBe("system");
	applyTheme();
	expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
});

test("picking a theme stamps it on the root and persists it", () => {
	setTheme("dark");

	expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
	expect(globalThis.localStorage.getItem("cc:theme")).toBe("dark");
	expect(getTheme()).toBe("dark");
});

test("going back to the device setting clears the stamp", () => {
	setTheme("light");
	setTheme("system");

	expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
	expect(globalThis.localStorage.getItem("cc:theme")).toBe("system");
});

test("an unknown saved value falls back to the device setting", () => {
	globalThis.localStorage.setItem("cc:theme", "sepia");
	expect(getTheme()).toBe("system");
});

test("applyTheme restores a saved theme on a fresh page", () => {
	globalThis.localStorage.setItem("cc:theme", "light");
	applyTheme();
	expect(document.documentElement.getAttribute("data-theme")).toBe("light");
});
