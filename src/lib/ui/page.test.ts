import { expect, test } from "bun:test";
import { bootstrap } from "#lib/ui/page.ts";

test("falls back to document.body when the page has no <main>", () => {
	document.body.innerHTML = "";
	const original = globalThis.localStorage;
	try {
		// @ts-expect-error Intentionally breaking the global for this test
		delete globalThis.localStorage;

		let called = false;
		bootstrap(() => {
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
