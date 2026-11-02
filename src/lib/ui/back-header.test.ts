import { expect, test } from "bun:test";
import { render } from "lit";
import { setLocale } from "#lib/i18n/index";
import { backHeader } from "#lib/ui/back-header";

const mount = (): HTMLElement => {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	document.body.append(root);
	return root;
};

test("a string back is a link", () => {
	setLocale("en");
	const root = mount();
	render(backHeader({ title: "Title", detail: "More", back: "/x" }), root);
	const link = root.querySelector('a[data-action="back"]');
	expect(link?.getAttribute("href")).toBe("/x");
	expect(link?.getAttribute("aria-label")).toBe("Back");
	expect(link?.querySelector("svg")).not.toBeNull();
	expect(root.querySelector(".back-header h1")?.textContent).toContain("Title");
	expect(root.querySelector(".back-header h1 small")?.textContent).toBe("More");
});

test("a function back is a quiet button that calls it", () => {
	setLocale("en");
	const root = mount();
	let calls = 0;
	render(
		backHeader({
			title: "Title",
			back: () => {
				calls++;
			},
		}),
		root,
	);
	const button = root.querySelector<HTMLButtonElement>(
		'button[data-action="back"]',
	);
	expect(button?.getAttribute("type")).toBe("button");
	expect(button?.getAttribute("data-variant")).toBe("quiet");
	expect(root.querySelector("h1 small")).toBeNull();
	button?.click();
	expect(calls).toBe(1);
});

test("the label is translated", () => {
	setLocale("th");
	const root = mount();
	render(backHeader({ title: "Title", back: "/" }), root);
	expect(
		root.querySelector('[data-action="back"]')?.getAttribute("aria-label"),
	).toBe("กลับ");
	setLocale("en");
});
