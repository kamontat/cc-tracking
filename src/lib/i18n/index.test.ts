import { beforeEach, expect, test } from "bun:test";
import { en } from "#lib/i18n/en";
import {
	detectLocale,
	getLocale,
	resetLocale,
	setLocale,
	subscribe,
	t,
} from "#lib/i18n/index";
import { th } from "#lib/i18n/th";

beforeEach(() => {
	globalThis.localStorage.clear();
	resetLocale();
});

test("the Thai catalog covers exactly the English key set", () => {
	expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
});

test("no catalog entry is left empty", () => {
	for (const [key, value] of Object.entries(th)) {
		expect(value.length, `th.${key} is empty`).toBeGreaterThan(0);
	}
	for (const [key, value] of Object.entries(en)) {
		expect(value.length, `en.${key} is empty`).toBeGreaterThan(0);
	}
});

test("a saved choice wins over the browser's languages", () => {
	expect(detectLocale("en", ["th-TH"])).toBe("en");
	expect(detectLocale("th", ["en-GB"])).toBe("th");
});

test("an English browser gets English when nothing is saved", () => {
	expect(detectLocale(null, ["en-GB", "th-TH"])).toBe("en");
});

test("everything else falls back to Thai", () => {
	expect(detectLocale(null, ["th-TH"])).toBe("th");
	expect(detectLocale(null, ["ja-JP"])).toBe("th");
	expect(detectLocale(null, [])).toBe("th");
	expect(detectLocale("de", ["ja-JP"])).toBe("th");
});

test("setting a locale persists it and notifies subscribers", () => {
	let notified = 0;
	const unsubscribe = subscribe(() => {
		notified += 1;
	});

	setLocale("en");
	expect(getLocale()).toBe("en");
	expect(globalThis.localStorage.getItem("cc:lang")).toBe("en");
	expect(notified).toBe(1);

	unsubscribe();
	setLocale("th");
	expect(notified).toBe(1);
});

test("the resolved locale survives a storage that throws", () => {
	const original = globalThis.localStorage.getItem;
	const originalLanguages = globalThis.navigator.languages;
	try {
		globalThis.localStorage.getItem = () => {
			throw new Error("blocked");
		};
		// Isolate the behaviour under test (a blocked store must not throw or crash
		// resolution) from browser-language detection, which is covered separately above.
		Object.defineProperty(globalThis.navigator, "languages", {
			value: [],
			configurable: true,
		});
		expect(getLocale()).toBe("th");
	} finally {
		globalThis.localStorage.getItem = original;
		Object.defineProperty(globalThis.navigator, "languages", {
			value: originalLanguages,
			configurable: true,
		});
	}
});

test("translates a key", () => {
	setLocale("en");
	expect(t("cards.title")).toBe("Cards");
	setLocale("th");
	expect(t("cards.title")).toBe("บัตร");
});

test("substitutes named parameters", () => {
	setLocale("en");
	expect(t("cards.purchaseCount", { count: 3 })).toBe("3 purchases");
	expect(t("cards.edit", { name: "KBank Visa" })).toBe("Edit KBank Visa");
});

test("leaves an unsupplied placeholder alone rather than printing undefined", () => {
	setLocale("en");
	expect(t("cards.edit")).toBe("Edit {name}");
});
