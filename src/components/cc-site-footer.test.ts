import { expect, test } from "bun:test";
import "#components/cc-site-footer";
import { setLocale } from "#lib/i18n/index";
import { REPO_URL } from "#lib/ui/build-info";

const SHA = "7ba698c1d4f0a2b3c4d5e6f708192a3b4c5d6e7f";

const mount = async (commit = "", builtAt = "") => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-site-footer");
	element.commit = commit;
	element.builtAt = builtAt;
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const hrefOf = (element: HTMLElement, selector: string) =>
	element.shadowRoot?.querySelector(selector)?.getAttribute("href");

const textOf = (element: HTMLElement, selector: string) =>
	element.shadowRoot?.querySelector(selector)?.textContent?.trim();

test("links the repository the page was built from", async () => {
	const element = await mount(SHA, "2026-09-24T13:12:00Z");

	expect(hrefOf(element, ".site-footer__repo")).toBe(REPO_URL);
});

test("links the commit by its full sha and shows the short one", async () => {
	const element = await mount(SHA, "2026-09-24T13:12:00Z");

	expect(hrefOf(element, ".site-footer__commit")).toBe(
		`${REPO_URL}/commit/${SHA}`,
	);
	expect(textOf(element, ".site-footer__commit")).toBe("7ba698c");
});

test("shows the build time it was given, in UTC", async () => {
	const element = await mount(SHA, "2026-09-24T13:12:00Z");

	expect(textOf(element, ".site-footer__built")).toContain(
		"2026-09-24 13:12 UTC",
	);
});

test("marks an uninlined build as dev and links no commit", async () => {
	const element = await mount();

	expect(element.shadowRoot?.querySelector("a.site-footer__commit")).toBeNull();
	expect(textOf(element, ".site-footer__commit")).toBe("dev");
});

test("falls back to the time the page was opened when no build time was inlined", async () => {
	const element = await mount();

	expect(textOf(element, ".site-footer__built")).toMatch(
		/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/,
	);
});

test("repaints its wording when the language changes", async () => {
	setLocale("en");
	const element = await mount(SHA, "2026-09-24T13:12:00Z");
	expect(textOf(element, ".site-footer__repo")).toBe("Source on GitHub");

	setLocale("th");
	await element.updateComplete;
	expect(textOf(element, ".site-footer__repo")).toBe("ซอร์สโค้ดบน GitHub");
});
