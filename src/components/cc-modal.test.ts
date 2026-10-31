import { expect, test } from "bun:test";
import type { CcModal } from "#components/cc-modal";
import "#components/cc-modal";
import { setLocale, t } from "#lib/i18n/index";

const mount = async (heading = "Add a card") => {
	setLocale("en");
	document.body.innerHTML = "";
	const element = document.createElement("cc-modal");
	element.heading = heading;
	element.innerHTML = "<p>body</p>";
	document.body.append(element);
	await element.updateComplete;
	return element;
};

const dialog = (element: CcModal) => {
	const found = element.shadowRoot?.querySelector("dialog");
	if (!found) throw new Error("no dialog");
	return found;
};

const closes = (element: CcModal) => {
	const seen: Event[] = [];
	element.addEventListener("close", (event) => seen.push(event));
	return seen;
};

test("opens itself as a modal dialog as soon as it is placed on the page", async () => {
	const element = await mount();

	expect(dialog(element).open).toBe(true);
	expect(element.shadowRoot?.querySelector("h2")?.textContent?.trim()).toBe(
		"Add a card",
	);
	const heading = element.shadowRoot?.querySelector("h2");
	expect(heading?.id).toBeTruthy();
	expect(dialog(element).getAttribute("aria-labelledby")).toBe(
		heading?.id ?? null,
	);
});

test("hands focus back to whatever opened it once the page renders it away", async () => {
	setLocale("en");
	document.body.innerHTML = "";
	// The opener sits inside another component's shadow root, as a table's Edit button does.
	const host = document.createElement("div");
	const opener = document.createElement("button");
	host.attachShadow({ mode: "open" }).append(opener);
	document.body.append(host);
	opener.focus();

	const element = document.createElement("cc-modal");
	document.body.append(element);
	await element.updateComplete;
	// A browser's showModal() moves focus into the dialog; happy-dom's does not, so do it here.
	element.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="close"]')
		?.focus();
	expect(document.activeElement).toBe(element);
	element.remove();

	expect(host.shadowRoot?.activeElement).toBe(opener);
});

test("asks to be closed from its close button, named in the current language", async () => {
	const element = await mount();
	const seen = closes(element);
	const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
		'[data-action="close"]',
	);

	expect(button?.getAttribute("aria-label")).toBe(t("common.close"));
	button?.click();

	expect(seen).toHaveLength(1);
});

test("asks to be closed on Escape, rather than closing behind the page's back", async () => {
	const element = await mount();
	const seen = closes(element);

	const cancel = new Event("cancel", { cancelable: true });
	dialog(element).dispatchEvent(cancel);

	// The page owns whether it is open; left to the browser, Escape would shut the dialog while
	// the page still believes it is showing.
	expect(cancel.defaultPrevented).toBe(true);
	expect(seen).toHaveLength(1);
});

test("asks to be closed when the backdrop is clicked, but not when its content is", async () => {
	const element = await mount();
	const seen = closes(element);

	element.shadowRoot
		?.querySelector(".body")
		?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
	expect(seen).toHaveLength(0);

	dialog(element).dispatchEvent(new MouseEvent("click", { bubbles: true }));
	expect(seen).toHaveLength(1);
});

test("as a sheet it has a grab handle and a worded Close", async () => {
	const element = await mount("Make a payment");
	element.sheet = true;
	await element.updateComplete;
	expect(element.hasAttribute("sheet")).toBe(true);
	expect(element.shadowRoot?.querySelector(".grab")).not.toBeNull();
	const close = element.shadowRoot?.querySelector('[data-action="close"]');
	expect(close?.textContent?.trim()).toBe("Close");
	const seen = closes(element);
	(close as HTMLButtonElement).click();
	expect(seen).toHaveLength(1);
});

// A browser runs the closing slide on the dialog; happy-dom runs none, so the tests below
// stand one in to check that `close` waits for it.
const stallExit = (element: CcModal) => {
	let finish!: () => void;
	const finished = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const target = dialog(element);
	target.getAnimations = () =>
		element.hasAttribute("closing")
			? [{ finished } as unknown as Animation]
			: [];
	return finish;
};

test("a sheet marks itself closing and asks to close only once its exit animation ends", async () => {
	const element = await mount("Make a payment");
	element.sheet = true;
	await element.updateComplete;
	const finish = stallExit(element);
	const seen = closes(element);
	element.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="close"]')
		?.click();
	expect(element.hasAttribute("closing")).toBe(true);
	expect(seen).toHaveLength(0);
	// A second request while it is leaving is the same close.
	dialog(element).dispatchEvent(new Event("cancel", { cancelable: true }));
	finish();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(seen).toHaveLength(1);
});

test("leave() lets a page close the sheet after its exit animation too", async () => {
	const element = await mount("Filter");
	element.sheet = true;
	await element.updateComplete;
	const finish = stallExit(element);
	let left = 0;
	element.leave(() => left++);
	expect(left).toBe(0);
	finish();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(left).toBe(1);
});

test("a held modal ignores every request to close", async () => {
	const element = await mount();
	element.held = true;
	const seen = closes(element);
	dialog(element).dispatchEvent(new Event("cancel", { cancelable: true }));
	element.shadowRoot
		?.querySelector<HTMLButtonElement>('[data-action="close"]')
		?.click();
	expect(seen).toHaveLength(0);
	expect(element.hasAttribute("closing")).toBe(false);
});

test("a held sheet that the browser closes anyway opens again", async () => {
	const element = await mount();
	element.sheet = true;
	element.held = true;
	await element.updateComplete;
	const seen = closes(element);
	// A second Escape closes a dialog without a cancel the page could refuse.
	dialog(element).close();
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(dialog(element).open).toBe(true);
	expect(seen).toHaveLength(0);
});

test("the closing slide and fade are in the sheet's styles, and stand down under reduced motion", () => {
	const customElement = customElements.get("cc-modal") as unknown as {
		styles: { cssText: string }[];
	};
	const text = customElement.styles.map((s) => s.cssText).join("\n");
	expect(text).toContain(":host([sheet][closing]) dialog[open]");
	expect(text).toMatch(/@keyframes sheet-fall/);
	expect(text).toMatch(/@keyframes backdrop-out/);
	expect(text).toMatch(/prefers-reduced-motion[\s\S]*closing/);
});
