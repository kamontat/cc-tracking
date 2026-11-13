import type { Repository } from "#lib/storage/repository"

import { messageOf } from "#lib/i18n/error"
import { migrateGroupColors } from "#lib/storage/assign-group-colors"
import { createRepository } from "#lib/storage/index"
import { migrateLocations } from "#lib/storage/migrate-locations"
import { migrateOwners } from "#lib/storage/migrate-owners"
import { seedLocations } from "#lib/storage/seed-locations"
import { seedOwners } from "#lib/storage/seed-owners"

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
 * up to date. A browser that refuses storage stops the page; the other steps only log, since
 * what they leave undone is cosmetic and runs again on the next load. Every island calls it.
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

	// Likewise an owner: the worst it leaves is a group labelled with an id.
	try {
		await seedOwners(repo, storage)
		await migrateOwners(repo)
	} catch (failure) {
		console.error(failure)
	}

	// A missing colour is cosmetic and the step runs again on the next load.
	try {
		await migrateGroupColors(repo, storage)
	} catch (failure) {
		console.error(failure)
	}

	return { ok: true, repo }
}
