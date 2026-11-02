import { beforeEach, expect, test } from "bun:test";
import "#components/cc-about";
import { resetLocale, setLocale } from "#lib/i18n/index";
import {
	type BuildInfo,
	CHANGELOG_URL,
	commitUrl,
	REPO_URL,
} from "#lib/ui/build-info";

process.env.TZ = "Asia/Bangkok";

const SHA = "3270f3d9c1a4e8b2f6d0a7c5e9b1d3f2a4c6e8b0";

const production: BuildInfo = {
	commit: SHA,
	builtAt: "2026-10-30T07:05:00Z",
	pr: "",
	environment: "production",
	branch: "main",
};

beforeEach(() => {
	resetLocale();
	setLocale("en");
});

const mount = async (build: BuildInfo) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-about");
	element.build = build;
	element.setAttribute("time-zone", "Asia/Bangkok");
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const rows = (element: HTMLElement) =>
	[...(element.shadowRoot?.querySelectorAll("[data-row]") ?? [])].map((row) =>
		row.getAttribute("data-row"),
	);

const value = (element: HTMLElement, row: string) =>
	element.shadowRoot?.querySelector(`[data-row="${row}"] dd`);

const link = (element: HTMLElement, row: string) =>
	value(element, row)?.querySelector("a") ?? null;

test("production shows every row", async () => {
	const element = await mount(production);

	expect(rows(element)).toEqual([
		"environment",
		"built",
		"source",
		"commit",
		"changelog",
	]);
	expect(value(element, "environment")?.textContent?.trim()).toBe("Production");
	expect(value(element, "built")?.textContent?.trim()).toBe(
		"30 Oct 2026, 14:05 (Asia/Bangkok)",
	);
	expect(link(element, "source")?.textContent?.trim()).toBe("main");
	expect(link(element, "source")?.getAttribute("href")).toBe(REPO_URL);
	expect(link(element, "commit")?.textContent?.trim()).toBe("3270f3d");
	expect(link(element, "commit")?.getAttribute("href")).toBe(commitUrl(SHA));
	expect(link(element, "changelog")?.getAttribute("href")).toBe(CHANGELOG_URL);
});

test("links open in a new tab", async () => {
	const element = await mount(production);
	for (const row of ["source", "commit", "changelog"]) {
		expect(link(element, row)?.getAttribute("target")).toBe("_blank");
		expect(link(element, row)?.getAttribute("rel")).toBe("noreferrer");
	}
});

test("preview names its pull request", async () => {
	const element = await mount({
		...production,
		environment: "preview",
		pr: "31",
		branch: "redesign-phase-2",
	});

	expect(link(element, "source")?.textContent?.trim()).toBe(
		"#31 · redesign-phase-2",
	);
	expect(rows(element)).toContain("commit");
	expect(rows(element)).not.toContain("changelog");
});

test("local hides commit and changelog", async () => {
	const element = await mount({ ...production, environment: "local" });
	expect(rows(element)).toEqual(["environment", "built", "source"]);
});

test("development hides the build time", async () => {
	const element = await mount({
		...production,
		environment: "development",
		branch: "",
	});

	expect(rows(element)).toEqual(["environment", "source"]);
	expect(link(element, "source")?.textContent?.trim()).toBe(
		"kamontat/cc-tracking",
	);
});

test("an unreadable build time is hidden", async () => {
	for (const builtAt of ["", "not a date"]) {
		const element = await mount({ ...production, builtAt });
		expect(rows(element)).not.toContain("built");
		const text = element.shadowRoot?.textContent ?? "";
		expect(text).not.toContain("Invalid");
		expect(text).not.toContain("NaN");
	}
});

test("reads in Thai", async () => {
	setLocale("th");
	const element = await mount(production);

	expect(element.shadowRoot?.querySelector("h2")?.textContent?.trim()).toBe(
		"เกี่ยวกับ",
	);
	expect(value(element, "environment")?.textContent?.trim()).toBe("ใช้งานจริง");
});
