import { expect, test } from "bun:test";
import { setLocale } from "#lib/i18n/index";
import type { Environment } from "#lib/ui/build-info";
import { currentTab, renderShell, type ShellView } from "#lib/ui/shell";

const mount = () => {
	document.body.innerHTML = `
		<header class="site-header" id="site-header"></header>
		<main class="page" id="page"></main>
		<div id="tabbar"></div>`;
};

const view = (over: Partial<ShellView> = {}): ShellView => ({
	path: "/cards",
	today: "2026-10-30",
	environment: "production",
	pr: "",
	...over,
});

const all = (selector: string) => [...document.querySelectorAll(selector)];
const texts = (selector: string) =>
	all(selector).map((element) => element.textContent?.trim());

test("current tab per path", () => {
	expect(currentTab("/")).toBe("home");
	expect(currentTab("/transactions")).toBe("transactions");
	expect(currentTab("/cards")).toBe("cards");
	expect(currentTab("/card")).toBe("cards");
	expect(currentTab("/settings")).toBe("settings");
	expect(currentTab("/cards/")).toBe("cards");
	expect(currentTab("/settings/")).toBe("settings");
	expect(currentTab("/nope")).toBeNull();
});

test("header carries the mark, the date and the tabs", () => {
	mount();
	renderShell(view());

	expect(document.querySelector(".site-header__mark")?.textContent).toBe("cc");
	expect(
		document.querySelector('[data-testid="today"]')?.textContent?.trim(),
	).toBe("30 Oct 2026");
	expect(
		all(".site-header__tabs a").map((link) => link.getAttribute("href")),
	).toEqual(["/", "/transactions", "/cards", "/settings"]);
	expect(texts(".site-header__tabs a")).toEqual([
		"Home",
		"Transactions",
		"Cards",
		"Settings",
	]);
	const pay = document.querySelector(".site-header__pay");
	expect(pay?.getAttribute("href")).toBe("/transactions");
	expect(pay?.textContent?.trim()).toBe("Payment");
});

test("bottom bar is home, transactions, add, cards, settings", () => {
	mount();
	renderShell(view());

	const links = all(".tabbar > a");
	expect(links.map((link) => link.getAttribute("data-tab"))).toEqual([
		"home",
		"transactions",
		null,
		"cards",
		"settings",
	]);
	const add = links[2];
	expect(add?.classList.contains("tabbar__add")).toBe(true);
	expect(add?.getAttribute("aria-label")).toBe("Payment");
	expect(add?.getAttribute("href")).toBe("/transactions");
});

test("the current tab is marked in both navs", () => {
	mount();
	renderShell(view({ path: "/cards" }));

	const current = all('[aria-current="page"]');
	expect(current).toHaveLength(2);
	for (const link of current) {
		expect(link.getAttribute("data-tab")).toBe("cards");
	}
	expect(all('[data-tab="cards"]')).toHaveLength(2);
});

test("no badge in production", () => {
	mount();
	renderShell(view({ environment: "production" }));

	expect(document.querySelector('[data-testid="env-badge"]')).toBeNull();
});

test("badge per build", () => {
	const cases: [Environment, string, string][] = [
		["development", "", "development"],
		["local", "", "local"],
		["preview", "7", "preview · pr-7"],
		["preview", "", "preview"],
	];
	for (const [environment, pr, expected] of cases) {
		mount();
		renderShell(view({ environment, pr }));
		expect(
			document.querySelector('[data-testid="env-badge"]')?.textContent?.trim(),
		).toBe(expected);
	}
});

test("Thai labels", () => {
	setLocale("th");
	mount();
	renderShell(view());

	expect(texts(".site-header__tabs a")).toEqual([
		"หน้าหลัก",
		"รายการเคลื่อนไหว",
		"บัตร",
		"ตั้งค่า",
	]);
	expect(document.querySelector(".site-header__pay")?.textContent?.trim()).toBe(
		"ชำระ",
	);
});
