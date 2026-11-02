import { afterEach, expect, test } from "bun:test";
import "#components/cc-fab-menu";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const mount = async () => {
	document.body.innerHTML = "<p id='outside'>page</p>";
	const element = document.createElement("cc-fab-menu");
	document.body.append(element);
	await element.updateComplete;
	const button = element.querySelector<HTMLButtonElement>("button.fab");
	const menu = element.querySelector<HTMLElement>(".fab-menu__list");
	if (!button || !menu) throw new Error("no button or menu");
	return { element, button, menu };
};

const items = (menu: HTMLElement) => [
	...menu.querySelectorAll<HTMLAnchorElement>("a.fab-menu__item"),
];

const press = (target: Element, key: string) =>
	target.dispatchEvent(
		new KeyboardEvent("keydown", { key, bubbles: true, composed: true }),
	);

test("a closed + New button, named, that says it controls a hidden menu", async () => {
	const { button, menu } = await mount();
	expect(button.getAttribute("type")).toBe("button");
	expect(button.getAttribute("aria-expanded")).toBe("false");
	expect(button.getAttribute("aria-controls")).toBe(menu.id);
	expect(button.getAttribute("aria-label")).toBe("New");
	expect(button.querySelector(".fab__label")?.textContent).toBe("New");
	expect(button.querySelector("svg")).not.toBeNull();
	expect(menu.hidden).toBe(true);
});

test("tapping it opens the menu with its two actions, each with an icon, and focuses the first", async () => {
	const { element, button, menu } = await mount();
	button.click();
	await element.updateComplete;
	expect(button.getAttribute("aria-expanded")).toBe("true");
	expect(menu.hidden).toBe(false);
	const links = items(menu);
	expect(links.map((a) => a.getAttribute("href"))).toEqual([
		"/list/new",
		"/pay",
	]);
	expect(links.map((a) => a.textContent?.trim())).toEqual([
		"New purchase list",
		"Make a payment",
	]);
	expect(links.map((a) => a.getAttribute("data-action"))).toEqual([
		"new-list",
		"pay",
	]);
	for (const link of links) expect(link.querySelector("svg")).not.toBeNull();
	expect(document.activeElement).toBe(links[0] ?? null);
});

test("Escape closes it and hands focus back to the button", async () => {
	const { element, button, menu } = await mount();
	button.click();
	await element.updateComplete;
	press(items(menu)[0] as Element, "Escape");
	await element.updateComplete;
	expect(menu.hidden).toBe(true);
	expect(button.getAttribute("aria-expanded")).toBe("false");
	expect(document.activeElement).toBe(button);
});

test("tapping the button again closes it", async () => {
	const { element, button, menu } = await mount();
	button.click();
	await element.updateComplete;
	button.click();
	await element.updateComplete;
	expect(menu.hidden).toBe(true);
	expect(document.activeElement).toBe(button);
});

test("a tap outside closes it without taking focus back", async () => {
	const { element, button, menu } = await mount();
	button.click();
	await element.updateComplete;
	document
		.querySelector("#outside")
		?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
	await element.updateComplete;
	expect(menu.hidden).toBe(true);
	expect(button.getAttribute("aria-expanded")).toBe("false");
	// A tap inside the menu leaves it open.
	button.click();
	await element.updateComplete;
	menu.dispatchEvent(
		new MouseEvent("click", { bubbles: true, composed: true }),
	);
	await element.updateComplete;
	expect(menu.hidden).toBe(false);
});

test("the arrow keys move between the two actions, round", async () => {
	const { element, button, menu } = await mount();
	button.click();
	await element.updateComplete;
	const [first, second] = items(menu);
	press(first as Element, "ArrowDown");
	expect(document.activeElement).toBe(second ?? null);
	press(second as Element, "ArrowDown");
	expect(document.activeElement).toBe(first ?? null);
	press(first as Element, "ArrowUp");
	expect(document.activeElement).toBe(second ?? null);
});

test("closing waits for the menu's exit animation before it hides", async () => {
	const { element, button, menu } = await mount();
	button.click();
	await element.updateComplete;
	let finish!: () => void;
	const finished = new Promise<void>((resolve) => {
		finish = resolve;
	});
	menu.getAnimations = () =>
		menu.getAttribute("data-state") === "closing"
			? [{ finished } as unknown as Animation]
			: [];
	press(button, "Escape");
	expect(menu.getAttribute("data-state")).toBe("closing");
	expect(menu.hidden).toBe(false);
	expect(button.getAttribute("aria-expanded")).toBe("false");
	finish();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await element.updateComplete;
	expect(menu.hidden).toBe(true);
	expect(menu.getAttribute("data-state")).toBeNull();
	expect(document.activeElement).toBe(button);
});

test("Thai labels", async () => {
	setLocale("th");
	const { element, button, menu } = await mount();
	button.click();
	await element.updateComplete;
	expect(button.querySelector(".fab__label")?.textContent).toBe("ใหม่");
	expect(items(menu).map((a) => a.textContent?.trim())).toEqual([
		"ใบรายการซื้อใหม่",
		"ชำระเงิน",
	]);
});

test("the stylesheet hides the closed menu over its own display rule", async () => {
	const css = await Bun.file("src/styles/app.css").text();
	expect(css).toMatch(/\.fab-menu__list\[hidden\]\s*\{\s*display: none;/);
});
