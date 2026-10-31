import { afterEach, expect, test } from "bun:test";
import { html, render } from "lit";
import { setLocale } from "#lib/i18n/index";
import { subHeader } from "#lib/ui/sub-header";

afterEach(() => setLocale("en"));

const mount = (): HTMLElement => {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	document.body.append(root);
	return root;
};

test("a slim bar: a back link, the title over a muted subtitle", () => {
	const root = mount();
	render(subHeader({ title: "Title", detail: "More", back: "/x" }), root);
	const bar = root.querySelector(".sub-header");
	const link = bar?.querySelector(':scope > a[data-action="back"]');
	expect(link?.getAttribute("href")).toBe("/x");
	expect(link?.getAttribute("aria-label")).toBe("Back");
	expect(link?.querySelector("svg")).not.toBeNull();
	expect(bar?.querySelector("h1 .sub-header__title")?.textContent).toBe(
		"Title",
	);
	expect(bar?.querySelector("h1 small")?.textContent).toBe("More");
	expect(bar?.querySelector(".sub-header__actions")).toBeNull();
});

test("no subtitle line without a detail", () => {
	const root = mount();
	render(subHeader({ title: "Title", back: "/" }), root);
	expect(root.querySelector(".sub-header h1 small")).toBeNull();
});

test("actions sit at the bar's end, outside the heading", () => {
	const root = mount();
	render(
		subHeader({
			title: "Title",
			back: "/",
			actions: html`<a data-action="edit" href="/e">Edit</a>`,
		}),
		root,
	);
	const actions = root.querySelector(".sub-header > .sub-header__actions");
	expect(actions?.querySelector('a[data-action="edit"]')).not.toBeNull();
	expect(root.querySelector(".sub-header h1")?.textContent).not.toContain(
		"Edit",
	);
});

test("the back label is translated", () => {
	setLocale("th");
	const root = mount();
	render(subHeader({ title: "Title", back: "/" }), root);
	expect(
		root.querySelector('[data-action="back"]')?.getAttribute("aria-label"),
	).toBe("กลับ");
});
