import { expect, test } from "bun:test";
import type { CcFabMenu } from "#components/cc-fab-menu";
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
	expect(currentTab("/pay")).toBe("transactions");
	expect(currentTab("/settings")).toBe("settings");
	expect(currentTab("/cards/")).toBe("cards");
	expect(currentTab("/settings/")).toBe("settings");
	for (const page of ["new", "draft", "reply", "view"])
		expect(currentTab(`/list/${page}`)).toBe("home");
	expect(currentTab("/list")).toBeNull();
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

test("one floating + New menu, outside both navs", async () => {
	mount();
	renderShell(view());

	const menus = all("cc-fab-menu");
	expect(menus).toHaveLength(1);
	const [menu] = menus as CcFabMenu[];
	await menu?.updateComplete;
	const button = menu?.querySelector("button.fab");
	expect(button?.getAttribute("aria-expanded")).toBe("false");
	expect(button?.querySelector(".fab__label")?.textContent).toBe("New");
	expect(
		[...(menu?.querySelectorAll("a.fab-menu__item") ?? [])].map((a) =>
			a.getAttribute("href"),
		),
	).toEqual(["/list/new", "/pay"]);
	expect(menu?.closest("nav")).toBeNull();
	expect(menu?.closest("#site-header")).toBeNull();
});

test("the tab bar holds no stray text beside the nav and the menu", () => {
	mount();
	renderShell(view());

	const tabbar = document.querySelector("#tabbar");
	const text = [...(tabbar?.childNodes ?? [])]
		.filter((node) => node.nodeType === Node.TEXT_NODE)
		.map((node) => node.textContent?.trim())
		.filter(Boolean);
	expect(text).toEqual([]);
});

test("the payment page marks the Transactions tab", () => {
	mount();
	renderShell(view({ path: "/pay" }));
	expect(
		all('[aria-current="page"]').map((link) => link.getAttribute("data-tab")),
	).toEqual(["transactions", "transactions"]);
});

test("rendering again keeps one floating menu", () => {
	mount();
	renderShell(view());
	renderShell(view({ path: "/" }));

	expect(all("cc-fab-menu")).toHaveLength(1);
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

test("Thai labels", async () => {
	setLocale("th");
	mount();
	renderShell(view());

	expect(texts(".site-header__tabs a")).toEqual([
		"หน้าหลัก",
		"รายการเคลื่อนไหว",
		"บัตร",
		"ตั้งค่า",
	]);
	await document.querySelector<CcFabMenu>("cc-fab-menu")?.updateComplete;
	const fab = document.querySelector("button.fab");
	expect(fab?.getAttribute("aria-label")).toBe("ใหม่");
	expect(fab?.querySelector(".fab__label")?.textContent).toBe("ใหม่");
	const date = document.querySelector('[data-testid="today"]');
	expect(date?.querySelector(".site-header__date-short")?.textContent).toBe(
		"ศ., 30 ต.ค.",
	);
	expect(date?.querySelector(".site-header__date-long")?.textContent).toBe(
		"ศ., 30 ต.ค. 2026",
	);
});

test("from 900px the header tabs reach up as far as down, so they share the brand's centre line", async () => {
	const css = await Bun.file("src/styles/app.css").text();
	const tabs = css.match(/\n\t\.site-header__tabs \{([^}]*)\}/)?.[1] ?? "";
	expect(tabs).toMatch(
		/margin-block: calc\(var\(--cc-space-3\) \* -1\)\s*calc\(\(var\(--cc-space-3\) \+ var\(--cc-rule-width\)\) \* -1\)/,
	);
	const link =
		css.match(/\n\t\.site-header__tabs a:any-link \{([^}]*)\}/)?.[1] ?? "";
	expect(link).toContain(
		"padding-block-start: calc(var(--cc-env-rule-width) - var(--cc-rule-width))",
	);
});
