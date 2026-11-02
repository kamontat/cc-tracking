import { expect, test } from "bun:test";
import { setLocale } from "#lib/i18n/index";
import { applyChrome } from "#lib/ui/chrome";

const mount = () => {
	document.body.innerHTML = `
		<header class="site-header" id="site-header"></header>
		<main class="page" id="page"></main>
		<div id="tabbar"></div>`;
};

const clock = () => new Date("2026-10-30T03:00:00Z");

test("title carries the build mark", () => {
	mount();
	const cases = [
		["preview", "42", "Card registry — cc-tracking (pr-42)"],
		["local", "", "Card registry — cc-tracking (local)"],
		["production", "", "Card registry — cc-tracking"],
		["preview", "", "Card registry — cc-tracking (preview)"],
	] as const;
	for (const [environment, pr, title] of cases) {
		applyChrome("title.cards", {
			build: { environment, pr },
			clock,
			path: "/cards",
		});
		expect(document.title).toBe(title);
	}
});

test("stamps the build on the root", () => {
	mount();
	for (const environment of [
		"development",
		"local",
		"preview",
		"production",
	] as const) {
		applyChrome("title.cards", {
			build: { environment, pr: "" },
			clock,
			path: "/cards",
		});
		expect(document.documentElement.getAttribute("data-env")).toBe(environment);
	}
});

test("a language switch re-renders the shell and keeps the current tab", () => {
	mount();
	applyChrome("title.settings", {
		build: { environment: "production", pr: "" },
		clock,
		path: "/settings",
	});
	setLocale("th");

	const links = [...document.querySelectorAll('[data-tab="settings"]')];
	expect(links).toHaveLength(2);
	for (const link of links) {
		expect(link.textContent?.trim()).toBe("ตั้งค่า");
		expect(link.getAttribute("aria-current")).toBe("page");
	}
	expect(document.title).toBe("ตั้งค่า — cc-tracking");
	expect(document.documentElement.lang).toBe("th");
});
