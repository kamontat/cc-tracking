import { expect, test } from "bun:test";
import "#components/cc-error-banner";
import { setLocale } from "#lib/i18n/index";

const mount = async (message: string) => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-error-banner");
	element.setAttribute("message", message);
	document.body.append(element);
	await (element as unknown as { updateComplete: Promise<unknown> })
		.updateComplete;
	return element;
};

test("shows the message it was given", async () => {
	const element = await mount("Could not save the card.");
	expect(element.shadowRoot?.textContent).toContain("Could not save the card.");
});

test("emits retry when the retry button is pressed", async () => {
	const element = await mount("Could not save the card.");
	let retried = false;
	element.addEventListener("retry", () => {
		retried = true;
	});
	element.shadowRoot?.querySelector("button")?.click();
	expect(retried).toBe(true);
});

test("renders nothing without a message", async () => {
	const element = await mount("");
	expect(element.shadowRoot?.querySelector("article")).toBeNull();
});

test("falls back to the retry label in the chosen language", async () => {
	setLocale("en");
	const element = await mount("Could not save the card.");
	expect(element.shadowRoot?.textContent).toContain("Try again");

	setLocale("th");
	await (element as unknown as { updateComplete: Promise<unknown> })
		.updateComplete;
	expect(element.shadowRoot?.textContent).toContain("ลองอีกครั้ง");
});

test("marks the banner as an error surface and its retry as a quiet button", async () => {
	document.body.innerHTML = "";
	const element = document.createElement("cc-error-banner");
	element.message = "Could not save the card.";
	document.body.append(element);
	await element.updateComplete;

	expect(
		element.shadowRoot?.querySelector('article[data-tone="danger"]'),
	).not.toBeNull();
	expect(
		element.shadowRoot?.querySelector('button[data-variant="quiet"]'),
	).not.toBeNull();
});

test("reflects emptiness to [hidden] so an empty banner does not consume a flex gap, and clears it once a message is set", async () => {
	const element = await mount("");
	expect(element.hasAttribute("hidden")).toBe(true);

	(element as unknown as { message: string }).message =
		"Could not save the card.";
	await (element as unknown as { updateComplete: Promise<unknown> })
		.updateComplete;

	expect(element.hasAttribute("hidden")).toBe(false);
});
