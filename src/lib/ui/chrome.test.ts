import { expect, test } from "bun:test";
import { setLocale } from "#lib/i18n/index";
import { applyChrome } from "#lib/ui/chrome";

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

test("refills them when the language changes", () => {
	mountNav();
	applyChrome("title.cards");
	setLocale("th");

	expect(document.title).toBe("ทะเบียนบัตร — cc-tracking");
	expect(document.querySelector("#nav-dashboard")?.textContent).toBe("หน้ารวม");
	expect(document.documentElement.lang).toBe("th");
});
