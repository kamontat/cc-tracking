import { afterEach, beforeEach } from "vitest"

import { resetLocale } from "#lib/i18n/index"
import { MIGRATION_KEY } from "#lib/storage/migrate-locations"
import { PAYMENTS_MIGRATION_KEY } from "#lib/storage/migrate-payments"
import { SEED_KEY } from "#lib/storage/seed-locations"

/**
 * Runs before every test in the suite, in every file: the locale singleton and
 * localStorage are both module-level state that would otherwise leak between tests.
 * Resetting the locale (rather than forcing "en") makes the next `getLocale()` re-detect,
 * which resolves to "en" here because happy-dom's `navigator.languages` is hardcoded to
 * `["en-US", "en"]`.
 */
beforeEach(() => {
	resetLocale()
	try {
		localStorage.clear()
	} catch {
		// A blocked or unavailable store is exercised deliberately by some tests.
	}
})

/**
 * And after every test, the startup markers go: a page that seeds or migrates against the
 * shared store (a route's `bootstrap`, a reset) must not leave the next test a browser
 * that reads as already seeded or migrated.
 */
afterEach(() => {
	try {
		for (const key of [SEED_KEY, MIGRATION_KEY, PAYMENTS_MIGRATION_KEY]) localStorage.removeItem(key)
	} catch {
		// As above: some tests take the store away on purpose.
	}
})
