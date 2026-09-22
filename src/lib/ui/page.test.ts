import { expect, test } from "bun:test";
import { setLocale } from "#lib/i18n/index";
import { bootstrap } from "#lib/ui/page";

const mountNav = () => {
	document.body.innerHTML = `
		<nav>
			<strong id="nav-brand">cc-tracking</strong>
			<a href="/" id="nav-dashboard">Dashboard</a>
			<a href="/cards" id="nav-cards">Cards</a>
		</nav>
		<main></main>`;
};

test("falls back to document.body when the page has no <main>", () => {
	document.body.innerHTML = "";
	const original = globalThis.localStorage;
	try {
		// @ts-expect-error Intentionally breaking the global for this test
		delete globalThis.localStorage;

		let called = false;
		bootstrap("title.cards", () => {
			called = true;
		});

		expect(called).toBe(false);
		const banner = document.body.querySelector("cc-error-banner");
		expect(banner).not.toBeNull();
		expect(banner?.message).toBeTruthy();
	} finally {
		globalThis.localStorage = original;
	}
});

test("applies chrome in the current language even when storage is unavailable and the renderer never runs", () => {
	mountNav();
	// Set while storage is still available, so this doesn't also exercise the "blocked
	// store" path of setLocale's own try/catch -- that's covered elsewhere.
	setLocale("th");
	const original = globalThis.localStorage;
	try {
		// @ts-expect-error Intentionally breaking the global for this test
		delete globalThis.localStorage;

		let called = false;
		bootstrap("title.cards", () => {
			called = true;
		});

		// The renderer never ran -- storage was unavailable -- yet the chrome that lives in
		// this page's static HTML is translated anyway, not left in whatever the markup
		// happened to be hard-coded to.
		expect(called).toBe(false);
		expect(document.title).toBe("ทะเบียนบัตร — cc-tracking");
		expect(document.querySelector("#nav-dashboard")?.textContent).toBe(
			"หน้ารวม",
		);
		expect(document.querySelector("#nav-cards")?.textContent).toBe("บัตร");
		expect(document.documentElement.lang).toBe("th");
	} finally {
		globalThis.localStorage = original;
	}
});
