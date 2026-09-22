import { expect, test } from "bun:test";
import { setLocale } from "#lib/i18n/index";
import { applyChrome, markCurrentLink } from "#lib/ui/chrome";

const currentOf = (id: string) =>
	document.querySelector(`#${id}`)?.getAttribute("aria-current");

const mountNav = () => {
	document.body.innerHTML = `
		<nav>
			<strong id="nav-brand">cc-tracking</strong>
			<a href="/" id="nav-dashboard">Dashboard</a>
			<a href="/cards" id="nav-cards">Cards</a>
		</nav>`;
};

test("fills the title and the nav in the current language", () => {
	mountNav();
	applyChrome("title.cards");

	expect(document.title).toBe("Card registry — cc-tracking");
	expect(document.querySelector("#nav-dashboard")?.textContent).toBe(
		"Dashboard",
	);
	expect(document.querySelector("#nav-cards")?.textContent).toBe("Cards");
});

test("marks the dashboard link as the current page on the root path", () => {
	mountNav();
	markCurrentLink(document, "/");

	expect(currentOf("nav-dashboard")).toBe("page");
	expect(currentOf("nav-cards")).toBeNull();
});

test("marks the cards link as the current page on the registry path", () => {
	mountNav();
	markCurrentLink(document, "/cards");

	expect(currentOf("nav-cards")).toBe("page");
	expect(currentOf("nav-dashboard")).toBeNull();
});

test("marks neither link on a card detail page", () => {
	mountNav();
	markCurrentLink(document, "/card");

	expect(currentOf("nav-dashboard")).toBeNull();
	expect(currentOf("nav-cards")).toBeNull();
});

test("clears a stale marker when the current path changes", () => {
	mountNav();
	markCurrentLink(document, "/cards");
	markCurrentLink(document, "/");

	expect(currentOf("nav-dashboard")).toBe("page");
	expect(currentOf("nav-cards")).toBeNull();
});

test("refills them when the language changes", () => {
	mountNav();
	applyChrome("title.cards");
	setLocale("th");

	expect(document.title).toBe("ทะเบียนบัตร — cc-tracking");
	expect(document.querySelector("#nav-dashboard")?.textContent).toBe("หน้ารวม");
	expect(document.documentElement.lang).toBe("th");
});
