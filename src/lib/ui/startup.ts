import type { Repository } from "#lib/storage/repository"

import { messageOf } from "#lib/i18n/error"
import { t } from "#lib/i18n/index"
import { migrateGroupColors } from "#lib/storage/assign-group-colors"
import { createRepository } from "#lib/storage/index"
import { migrateLocations } from "#lib/storage/migrate-locations"
import { migratePayments } from "#lib/storage/migrate-payments"
import { seedLocations } from "#lib/storage/seed-locations"

export type StartupOptions = {
	storage?: Storage
	createRepo?: () => Repository
}

/**
 * The store, ready to read; or why the page can't show, as a sentence re-read in the reader's
 * language each time (`message()`), so a banner showing it can follow a language switch.
 */
export type Opened = { ok: true; repo: Repository } | { ok: false; message: () => string }

/**
 * What every page does before it reads anything: create the repository and bring stored data
 * up to date. A browser that refuses storage, or a payment conversion that fails, stops the
 * page; the other steps only log, since what they leave undone is cosmetic and runs again on
 * the next load. Every island calls it.
 */
export async function openRepository(options: StartupOptions = {}): Promise<Opened> {
	let repo: Repository
	try {
		repo = (options.createRepo ?? createRepository)()
	} catch (error) {
		console.error(error)
		return { ok: false, message: () => messageOf(error, "startup.failed") }
	}

	const storage = options.storage ?? globalThis.localStorage

	// A location that could not be rewritten is a cosmetic problem; refusing to render would
	// turn it into an outage.
	try {
		await seedLocations(repo, storage)
		await migrateLocations(repo, storage)
	} catch (failure) {
		console.error(failure)
	}

	// Numbers read from half-converted payments would be wrong, so a failure stops the page.
	// The marker stays unset; a reload retries.
	try {
		await migratePayments(repo, storage)
	} catch (failure) {
		console.error(failure)
		return { ok: false, message: () => t("startup.paymentsFailed") }
	}

	// A missing colour is cosmetic and the step runs again on the next load.
	try {
		await migrateGroupColors(repo, storage)
	} catch (failure) {
		console.error(failure)
	}

	return { ok: true, repo }
}
