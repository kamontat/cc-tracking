import { afterEach, expect, test } from "bun:test";
import "#components/cc-more-menu";
import type { CcMoreMenu, MoreItem } from "#components/cc-more-menu";
import { setLocale } from "#lib/i18n/index";

afterEach(() => setLocale("en"));

const ITEMS: MoreItem[] = [
	{ action: "archive", label: "Archive card" },
	{
		action: "delete",
		label: "Delete card",
		variant: "danger",
		ask: "Delete KBank?",
	},
];

const mount = async (items: MoreItem[] = ITEMS) => {
	document.body.innerHTML = "<button id='outside'>page</button>";
	const element = document.createElement("cc-more-menu") as CcMoreMenu;
	element.items = items;
	document.body.append(element);
	await element.updateComplete;
	const root = element.shadowRoot as ShadowRoot;
	const toggle = root.querySelector<HTMLButtonElement>("button.more");
	if (!toggle) throw new Error("no More button");
	const picked: string[] = [];
	element.addEventListener("menu-select", (event) =>
		picked.push((event as CustomEvent<{ action: string }>).detail.action),
	);
	return { element, root, toggle, picked };
};

const list = (root: ShadowRoot) =>
	root.querySelector<HTMLElement>(".more-menu");

const button = (root: ShadowRoot, action: string) =>
	root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);

const focused = (element: CcMoreMenu) => element.shadowRoot?.activeElement;

const openMenu = async (element: CcMoreMenu, toggle: HTMLButtonElement) => {
	toggle.click();
	await element.updateComplete;
};

test("a closed ⋯ button named More that controls a hidden list", async () => {
	const { root, toggle } = await mount();
	expect(toggle.textContent?.trim()).toBe("⋯");
	expect(toggle.getAttribute("aria-label")).toBe("More");
	expect(toggle.getAttribute("aria-expanded")).toBe("false");
	expect(toggle.getAttribute("data-variant")).toBe("quiet");
	expect(toggle.getAttribute("aria-controls")).toBe(list(root)?.id ?? "");
	expect(list(root)?.hidden).toBe(true);
});

test("⋯ opens the list of buttons and focuses the first", async () => {
	const { element, root, toggle } = await mount();
	await openMenu(element, toggle);
	expect(toggle.getAttribute("aria-expanded")).toBe("true");
	expect(list(root)?.hidden).toBe(false);
	const buttons = [...(list(root)?.querySelectorAll("button") ?? [])];
	expect(buttons.map((b) => b.textContent?.trim())).toEqual([
		"Archive card",
		"Delete card",
	]);
	expect(buttons.map((b) => b.getAttribute("data-variant"))).toEqual([
		"quiet",
		"danger",
	]);
	expect(focused(element)).toBe(buttons[0] ?? null);
});

test("a plain item says which, closes, and hands focus back to ⋯", async () => {
	const { element, root, toggle, picked } = await mount();
	await openMenu(element, toggle);
	button(root, "archive")?.click();
	await element.updateComplete;
	expect(picked).toEqual(["archive"]);
	expect(list(root)?.hidden).toBe(true);
	expect(focused(element)).toBe(toggle);
});

test("Escape closes it and hands focus back to ⋯", async () => {
	const { element, root, toggle } = await mount();
	await openMenu(element, toggle);
	button(root, "archive")?.dispatchEvent(
		new KeyboardEvent("keydown", {
			key: "Escape",
			bubbles: true,
			composed: true,
		}),
	);
	await element.updateComplete;
	expect(list(root)?.hidden).toBe(true);
	expect(toggle.getAttribute("aria-expanded")).toBe("false");
	expect(focused(element)).toBe(toggle);
});

test("a click outside closes it; a click inside does not", async () => {
	const { element, root, toggle } = await mount();
	await openMenu(element, toggle);
	list(root)?.click();
	await element.updateComplete;
	expect(list(root)?.hidden).toBe(false);
	document.querySelector<HTMLElement>("#outside")?.click();
	await element.updateComplete;
	expect(list(root)?.hidden).toBe(true);
	expect(focused(element)).toBe(toggle);
});

test("an item with a question asks twice: Delete and Keep, focus following", async () => {
	const { element, root, toggle, picked } = await mount();
	await openMenu(element, toggle);
	button(root, "delete")?.click();
	await element.updateComplete;
	expect(picked).toEqual([]);
	expect(root.querySelector(".ask")?.textContent).toBe("Delete KBank?");
	expect(button(root, "archive")).toBeNull();
	const confirm = button(root, "confirm");
	expect(confirm?.textContent?.trim()).toBe("Delete");
	expect(confirm?.getAttribute("data-variant")).toBe("danger");
	expect(focused(element)).toBe(confirm);

	button(root, "keep")?.click();
	await element.updateComplete;
	expect(root.querySelector(".ask")).toBeNull();
	expect(focused(element)).toBe(button(root, "delete"));
	expect(picked).toEqual([]);

	button(root, "delete")?.click();
	await element.updateComplete;
	button(root, "confirm")?.click();
	await element.updateComplete;
	expect(picked).toEqual(["delete"]);
	expect(list(root)?.hidden).toBe(true);
});

test("closing forgets a pending question", async () => {
	const { element, root, toggle } = await mount();
	await openMenu(element, toggle);
	button(root, "delete")?.click();
	await element.updateComplete;
	await openMenu(element, toggle);
	await openMenu(element, toggle);
	expect(root.querySelector(".ask")).toBeNull();
	expect(button(root, "delete")).not.toBeNull();
});

test("a language switch re-renders in place", async () => {
	const { element, toggle } = await mount();
	setLocale("th");
	await element.updateComplete;
	expect(toggle.getAttribute("aria-label")).toBe("เพิ่มเติม");
});
