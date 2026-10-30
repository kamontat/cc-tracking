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

test("header carries the mark, the date and the tabs, and no Payment", () => {
	mount();
	renderShell(view());

	expect(document.querySelector(".site-header__mark")?.textContent).toBe("cc");
	expect(
		all(".site-header__tabs a").map((link) => link.getAttribute("href")),
	).toEqual(["/", "/transactions", "/cards", "/settings"]);
	expect(texts(".site-header__tabs a")).toEqual([
		"Home",
		"Transactions",
		"Cards",
		"Settings",
	]);
	const header = document.querySelector("#site-header");
	expect(header?.querySelector("[data-action]")).toBeNull();
	expect(header?.textContent).not.toContain("Payment");
});

test("the header date carries the phone and the desktop forms", () => {
	mount();
	renderShell(view({ today: "2026-11-05" }));

	const date = document.querySelector('[data-testid="today"]');
	expect(date?.querySelector(".site-header__date-short")?.textContent).toBe(
		"Thu, 05 Nov",
	);
	expect(date?.querySelector(".site-header__date-long")?.textContent).toBe(
		"Thu, 05 Nov 2026",
	);
});

test("the header is one row: the brand run, then the tabs", () => {
	mount();
	renderShell(view({ environment: "preview", pr: "30" }));

	const bar = document.querySelector(".site-header__bar");
	expect([...(bar?.children ?? [])].map((child) => child.className)).toEqual([
		"site-header__id",
		"site-header__tabs",
	]);
});

test("brand, build mark, a hidden dot, then the date, as one run", () => {
	mount();
	renderShell(view({ environment: "preview", pr: "30" }));

	const run = document.querySelector(".site-header__id");
	expect([...(run?.children ?? [])].map((child) => child.className)).toEqual([
		"site-header__brand",
		"site-header__env",
		"site-header__sep",
		"site-header__date",
	]);
	const dot = run?.querySelector(".site-header__sep");
	expect(dot?.textContent).toBe("·");
	expect(dot?.getAttribute("aria-hidden")).toBe("true");
	// The brand link wraps only the mark and the name, never the build mark or the date.
	expect(document.querySelector(".site-header__brand")?.textContent).toBe(
		"cctracking",
	);
});

test("bottom bar is exactly the four tabs, with no add button", () => {
	mount();
	renderShell(view());

	const links = all(".tabbar > *");
	expect(links.map((link) => link.getAttribute("data-tab"))).toEqual([
		"home",
		"transactions",
		"cards",
		"settings",
	]);
	expect(document.querySelector(".tabbar [data-action]")).toBeNull();
	expect(document.querySelector(".tabbar__add")).toBeNull();
});

test("one floating Payment button, outside both navs", () => {
	mount();
	renderShell(view());

	const pay = all('[data-action="pay"]');
	expect(pay).toHaveLength(1);
	const [fab] = pay;
	expect(fab?.classList.contains("fab")).toBe(true);
	expect(fab?.getAttribute("href")).toBe("/transactions");
	expect(fab?.getAttribute("aria-label")).toBe("Payment");
	expect(fab?.querySelector(".fab__label")?.textContent).toBe("Payment");
	expect(fab?.querySelector("svg")).not.toBeNull();
	expect(fab?.closest("nav")).toBeNull();
	expect(fab?.closest("#site-header")).toBeNull();
});

test("rendering again keeps one floating button", () => {
	mount();
	renderShell(view());
	renderShell(view({ path: "/" }));

	expect(all('[data-action="pay"]')).toHaveLength(1);
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

test("no build mark in production", () => {
	mount();
	renderShell(view({ environment: "production" }));

	expect(document.querySelector('[data-testid="env-mark"]')).toBeNull();
	const run = document.querySelector(".site-header__id");
	expect([...(run?.children ?? [])].map((child) => child.className)).toEqual([
		"site-header__brand",
		"site-header__sep",
		"site-header__date",
	]);
});

test("build mark per build, as plain text", () => {
	const cases: [Environment, string, string][] = [
		["development", "", "(dev)"],
		["local", "", "(local)"],
		["preview", "7", "(pr-7)"],
		["preview", "", "(preview)"],
	];
	for (const [environment, pr, expected] of cases) {
		mount();
		renderShell(view({ environment, pr }));
		expect(
			document.querySelector('[data-testid="env-mark"]')?.textContent?.trim(),
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
	const fab = document.querySelector('[data-action="pay"]');
	expect(fab?.getAttribute("aria-label")).toBe("ชำระ");
	expect(fab?.querySelector(".fab__label")?.textContent).toBe("ชำระ");
	const date = document.querySelector('[data-testid="today"]');
	expect(date?.querySelector(".site-header__date-short")?.textContent).toBe(
		"ศ., 30 ต.ค.",
	);
	expect(date?.querySelector(".site-header__date-long")?.textContent).toBe(
		"ศ., 30 ต.ค. 2026",
	);
});
