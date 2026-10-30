import { expect, test } from "bun:test";
import { en } from "#lib/i18n/en";
import { setLocale } from "#lib/i18n/index";
import { renderTransactionsPage } from "./transactions";

const mount = (): HTMLElement => {
	document.body.innerHTML = "";
	const root = document.createElement("div");
	document.body.append(root);
	return root;
};

test("names the page and the next step", () => {
	setLocale("en");
	const root = mount();
	renderTransactionsPage(root);
	expect(root.querySelector("h1")?.textContent).toBe("Transactions");
	expect(root.querySelector(".placeholder")?.textContent).toBe(
		en["transactions.soon"],
	);
	expect(
		root.querySelector('[data-action="to-cards"]')?.getAttribute("href"),
	).toBe("/cards");
});

test("re-renders in Thai", () => {
	setLocale("en");
	const root = mount();
	renderTransactionsPage(root);
	setLocale("th");
	expect(root.querySelector("h1")?.textContent).toBe("รายการเคลื่อนไหว");
	setLocale("en");
});
