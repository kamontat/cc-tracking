import { expect, test } from "bun:test";
import { setLocale } from "#lib/i18n/index";
import { PAYMENTS_MIGRATION_KEY } from "#lib/storage/migrate-payments";
import { InMemoryRepository } from "#lib/storage/repository";
import { buildInfo, titleMark } from "#lib/ui/build-info";
import { bootstrap } from "#lib/ui/page";

const mountNav = () => {
	document.body.innerHTML = `
		<header class="site-header" id="site-header"></header>
		<main class="page" id="page"></main>
		<div id="tabbar"></div>`;
};

const tabTexts = (tab: string) =>
	[...document.querySelectorAll(`[data-tab="${tab}"]`)].map((link) =>
		link.textContent?.trim(),
	);

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
		// The test run has no inlined build, so the title carries whatever mark that reads as.
		const { environment, pr } = buildInfo();
		expect(document.title).toBe(
			`ทะเบียนบัตร — cc-tracking${titleMark(environment, pr)}`,
		);
		expect(tabTexts("home")).toEqual(["หน้าหลัก", "หน้าหลัก"]);
		expect(tabTexts("cards")).toEqual(["บัตร", "บัตร"]);
		expect(document.documentElement.lang).toBe("th");
	} finally {
		globalThis.localStorage = original;
	}
});

test("the storage-unavailable banner follows a locale switch instead of freezing in the language it failed in", () => {
	mountNav();
	setLocale("en");
	const original = globalThis.localStorage;
	try {
		// @ts-expect-error Intentionally breaking the global for this test
		delete globalThis.localStorage;

		bootstrap("title.cards", () => {});

		// createRepository() throws StorageUnavailableError, a MessageError keyed to
		// "storage.unavailable" -- that key, not the "startup.failed" fallback, is what
		// messageOf renders, since a MessageError always speaks for itself.
		const banner = document.querySelector("cc-error-banner");
		expect(banner?.message).toBe(
			"This browser is not letting the page store data. Private windows and blocked site data both cause this.",
		);
		expect(banner?.retryLabel).toBe("Reload");

		// A locale change reaches every page through the same subscribe mechanism --
		// the banner must follow it too, not freeze in whatever language start-up failed in.
		setLocale("th");

		expect(banner?.message).toBe(
			"เบราว์เซอร์นี้ไม่อนุญาตให้หน้าเว็บเก็บข้อมูล หน้าต่างส่วนตัวและการบล็อกข้อมูลเว็บไซต์ทำให้เกิดปัญหานี้",
		);
		expect(banner?.retryLabel).toBe("โหลดใหม่");
	} finally {
		globalThis.localStorage = original;
	}
});

test("a failed payment conversion shows the banner, not the page", async () => {
	mountNav();
	setLocale("en");
	const storage = globalThis.localStorage;
	storage.removeItem(PAYMENTS_MIGRATION_KEY);
	const repo = new InMemoryRepository();
	await repo.saveCard({
		id: "A",
		name: "A",
		last4: "0000",
		location: "krabi",
		cycle: { kind: "offset", closeDay: 25, dueOffsetDays: 20 },
		archived: false,
		limitGroupId: "g1",
	});
	await repo.savePurchase({
		id: "p1",
		cardId: "A",
		date: "2026-09-10",
		amount: 1_00,
		note: "",
	});
	await repo.savePayment({
		cardId: "A",
		period: "2026-09",
		paidAt: "2026-10-01",
		closeDate: "2026-09-25",
		dueDate: "2026-10-15",
		parts: [{ paidAt: "2026-10-01", amount: 1_00 }],
	});
	repo.saveCardPayment = async () => {
		throw new Error("disk full");
	};
	repo.saveStatementDates = async () => {};
	let rendered = false;
	const spy = console.error;
	console.error = () => {};
	try {
		await bootstrap(
			"title.cards",
			() => {
				rendered = true;
			},
			{ storage, createRepo: () => repo },
		);
	} finally {
		console.error = spy;
	}

	expect(rendered).toBe(false);
	const banner = document.querySelector("cc-error-banner");
	expect(banner?.message).toBe(
		"Could not update your saved payments. Nothing was lost. Reload to try again.",
	);
	expect(storage.getItem(PAYMENTS_MIGRATION_KEY)).toBeNull();
});
