import { beforeEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { resetLocale } from "#lib/i18n/index";

GlobalRegistrator.register();

/**
 * Runs before every test in the suite, in every file: the locale singleton and
 * localStorage are both module-level state that would otherwise leak between test
 * files that share this process. Resetting the locale (rather than forcing "en")
 * makes the next `getLocale()` re-detect, which resolves to "en" here because
 * happy-dom's `navigator.languages` is hardcoded to `["en-US", "en"]`.
 */
beforeEach(() => {
	resetLocale();
	try {
		localStorage.clear();
	} catch {
		// A blocked or unavailable store is exercised deliberately by some tests.
	}
});
