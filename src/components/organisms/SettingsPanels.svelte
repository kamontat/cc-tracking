<script lang="ts">
	import type { Snippet } from "svelte"
	import type { LocationRecord, OwnerRecord } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { V4Counts } from "#lib/storage/transfer-v4"
	import type { PurgedDetail } from "#lib/ui/purge"
	import type { RestoredDetail } from "#lib/ui/restore"
	import type { Opened } from "#lib/ui/startup"

	import { onMount } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import PurgeSheet from "#components/organisms/PurgeSheet.svelte"
	import RestoreSheet from "#components/organisms/RestoreSheet.svelte"
	import { today } from "#lib/domain/date"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { SEED_KEY, seedLocations } from "#lib/storage/seed-locations"
	import { OWNERS_SEED_KEY, seedOwners } from "#lib/storage/seed-owners"
	import { countRecordsV4, exportBackupV4 } from "#lib/storage/transfer-v4"
	import { createPageState } from "#lib/ui/page-state"
	import { countsText } from "#lib/ui/record-counts"
	import { backupFilename, locationsSummary, ownersSummary, prepareBackupFile } from "#lib/ui/settings"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * The Settings page's island (RD-19): its sections in `.set` panels, Display, Locations and
	 * owners (a row into each page) and Backup in the main column, Reset and About beside them
	 * from 900px. Display and About come in as slots, since they need none of the reader's data; the rest reads or writes the store,
	 * so it renders in the browser (PRD DD-172). The markup is the legacy route's, so app.css
	 * draws it unchanged.
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Holds the location and payments markers, for Delete all and the restore sheet alike. */
		storage?: Storage
		/** The Display section's rows. */
		display?: Snippet
		/** The About section's rows. */
		about?: Snippet
		/** Unused: Astro names each slotted child, but its type check still counts them as children. */
		children?: Snippet
	}

	const { open = () => openRepository(), storage = globalThis.localStorage, display, about }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let repo = $state<Repository | null>(null)
	let locations = $state<LocationRecord[]>([])
	let owners = $state<OwnerRecord[]>([])
	/** Why the store would not open, re-read in the reader's language. */
	let startupFailure = $state<(() => string) | null>(null)
	/** Bumped after every load, so the banner re-reads the page state's error. */
	let painted = $state(0)

	/** Which sheet is open; closing one forgets its steps, so the next opens fresh. */
	let openSheet = $state<"restore" | "purge" | null>(null)
	let copied = $state(false)
	// Counts and names rather than sentences, so each message follows a language switch.
	let imported = $state<RestoredDetail | null>(null)
	let resetCounts = $state<V4Counts | null>(null)
	let resetDone = $state(false)
	let purged = $state<PurgedDetail | null>(null)

	const page = createPageState({
		fetch: async () => {
			if (repo) [locations, owners] = await Promise.all([repo.listLocations(), repo.listOwners()])
		},
		fallbackKey: "settings.error.read",
		paint: () => {
			painted++
		},
	})

	const bannerMessage = $derived.by(() => {
		void lang
		void painted
		return startupFailure ? startupFailure() : page.error
	})

	/** Runs `action` against the store through the page state's guard. */
	const guard = (action: (repo: Repository) => Promise<void>, messageKey: MessageKey) => {
		const store = repo
		return store ? page.guard(() => action(store), messageKey) : Promise.resolve()
	}

	const onExport = () =>
		guard(async (store) => {
			const { filename, text } = await prepareBackupFile(store)
			const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
			const link = document.createElement("a")
			link.href = url
			link.download = filename
			link.click()
			// Revoking synchronously after click() risks revoking before the browser has started
			// reading the blob (a long-standing source of dropped downloads); a tick later is safe.
			setTimeout(() => URL.revokeObjectURL(url), 0)
		}, "backup.error.export")

	const onCopy = () => {
		copied = false
		return guard(async (store) => {
			// Compact, unlike the file: pasted text is carried around, not read, so skip the indent.
			await navigator.clipboard.writeText(JSON.stringify(await exportBackupV4(store, new Date())))
			copied = true
		}, "backup.error.copy")
	}

	/** Only offered where the browser exposes it: older Firefox and plain-http pages do not. */
	const canWriteClipboard = typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function"

	const toggleSheet = (sheet: "restore" | "purge") => {
		openSheet = openSheet === sheet ? null : sheet
	}

	/** The restore sheet wrote a copy: show its counts, and read the locations again. */
	const onRestored = (detail: RestoredDetail) => {
		imported = detail
		resetDone = false
		purged = null
		openSheet = null
		void page.load()
	}

	/** The purge sheet deleted old purchases: say how many in the Reset panel. */
	const onPurged = (detail: PurgedDetail) => {
		purged = detail
		resetDone = false
		openSheet = null
	}

	const onStartReset = () => {
		resetDone = false
		purged = null
		return guard(async (store) => {
			resetCounts = await countRecordsV4(store)
		}, "reset.error")
	}

	const onConfirmReset = () => {
		imported = null
		purged = null
		return guard(async (store) => {
			resetCounts = null
			await store.clearAll()
			// Seed the starting places again, so Home and the Locations page are not empty. The
			// marker goes first: an in-memory repository's clearAll leaves storage alone.
			storage.removeItem(SEED_KEY)
			await seedLocations(store, storage)
			// Likewise the starting owners, so a new limit group has someone to belong to.
			storage.removeItem(OWNERS_SEED_KEY)
			await seedOwners(store, storage)
			owners = await store.listOwners()
			resetDone = true
		}, "reset.error")
	}

	const importedMessage = $derived.by(() => {
		void lang
		if (!imported) return ""
		return imported.file === undefined
			? t("backup.importedText", { counts: countsText(imported) })
			: t("backup.imported", { counts: countsText(imported), file: imported.file })
	})

	const resetMessage = $derived.by(() => {
		void lang
		if (resetDone) return t("reset.done")
		if (!purged) return ""
		return t(purged.count === 1 ? "purge.done.one" : "purge.done.many", {
			count: purged.count,
			age: t(`purge.span.${purged.age}`),
		})
	})

	/** What *Delete all data* would delete, kind by kind, following a language switch. */
	const askText = (counts: V4Counts) => {
		void lang
		return t("reset.ask", { counts: countsText(counts) })
	}

	const summary = $derived.by(() => {
		void lang
		return locationsSummary(locations)
	})

	const ownersLine = $derived(ownersSummary(owners))

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		void (async () => {
			const opened = await open()
			if (!opened.ok) {
				startupFailure = opened.message
				return
			}
			repo = opened.repo
			await page.load()
		})()
		return unsubscribe
	})
</script>

<ErrorBanner message={bannerMessage} retryLabel={tr("common.reload")} onretry={onRetry} />
<div class="settings-grid">
	<div class="settings-grid__main">
		<section class="set-section" data-section="display">
			<h2>{tr("settings.display.title")}</h2>
			<div class="set">{@render display?.()}</div>
		</section>
		<section class="set-section" data-section="locations">
			<h2>{tr("settings.places.title")}</h2>
			<div class="set">
				<a class="set-row" data-row="locations" href="/settings/locations">
					<span class="set-row__text"
						>{tr("settings.locations.manage")}<small class="set-row__sub">{summary}</small></span
					>
					<span class="set-row__chev" aria-hidden="true">›</span>
				</a>
				<a class="set-row" data-row="owners" href="/settings/owners">
					<span class="set-row__text"
						>{tr("settings.owners.manage")}<small class="set-row__sub">{ownersLine}</small></span
					>
					<span class="set-row__chev" aria-hidden="true">›</span>
				</a>
			</div>
		</section>
		<section class="set-section" data-section="backup">
			<h2>{tr("backup.title")}</h2>
			<div class="set">
				<button class="set-row" type="button" data-row="download" onclick={onExport}>
					<span class="set-row__text"
						>{tr("settings.backup.download")}<small class="set-row__sub">{backupFilename(new Date())}</small></span
					>
					<span class="set-row__action">{tr("settings.backup.downloadAction")}</span>
				</button>
				{#if canWriteClipboard}
					<button class="set-row" type="button" data-row="copy" onclick={onCopy}>
						<span class="set-row__text"
							>{tr("settings.backup.copy")}<small class="set-row__sub">{tr("settings.backup.copyHint")}</small></span
						>
						<span class="set-row__action" data-variant="quiet" aria-live="polite"
							>{copied ? tr("settings.backup.copied") : tr("settings.backup.copyAction")}</span
						>
					</button>
				{/if}
				<button
					class="set-row"
					type="button"
					data-row="restore"
					aria-haspopup="dialog"
					aria-expanded={openSheet === "restore"}
					onclick={() => toggleSheet("restore")}>
					<span class="set-row__text"
						>{tr("backup.restore.title")}<small class="set-row__sub">{tr("settings.backup.restoreHint")}</small></span
					>
					<span class="set-row__action" data-variant="quiet">{tr("settings.backup.restoreAction")}</span>
				</button>
			</div>
			<p class="set-note">{tr("backup.warning")}</p>
			<p class="import-status" role="status">{importedMessage}</p>
			{#if openSheet === "restore" && repo}
				<RestoreSheet
					{repo}
					{storage}
					onrestored={onRestored}
					onclose={() => {
						openSheet = null
					}} />
			{/if}
		</section>
	</div>
	<div class="settings-grid__side">
		<section class="set-section" data-section="reset">
			<h2>{tr("reset.title")}</h2>
			<div class="set">
				<button
					class="set-row"
					type="button"
					data-row="purge"
					aria-haspopup="dialog"
					aria-expanded={openSheet === "purge"}
					onclick={() => toggleSheet("purge")}>
					<span class="set-row__text"
						>{tr("settings.reset.purge")}<small class="set-row__sub">{tr("settings.reset.purgeHint")}</small></span
					>
					<span class="set-row__action" data-variant="quiet">{tr("settings.reset.purgeAction")}</span>
				</button>
				{#if resetCounts === null}
					<button class="set-row" type="button" data-row="delete-all" onclick={onStartReset}>
						<span class="set-row__text"
							>{tr("settings.reset.all")}<small class="set-row__sub">{tr("settings.reset.allHint")}</small></span
						>
						<span class="set-row__action" data-variant="danger">{tr("settings.reset.allAction")}</span>
					</button>
				{:else}
					{@const counts = resetCounts}
					<div class="set-ask">
						<p class="set-ask__note">{askText(counts)}</p>
						<div class="set-ask__actions">
							<button
								type="button"
								data-action="keep-data"
								onclick={() => {
									resetCounts = null
								}}>
								{tr("reset.keep")}
							</button>
							<button data-variant="danger" type="button" data-action="delete-everything" onclick={onConfirmReset}>
								{tr("reset.deleteEverything")}
							</button>
						</div>
					</div>
				{/if}
			</div>
			<p class="reset-status" role="status">{resetMessage}</p>
			{#if openSheet === "purge" && repo}
				<PurgeSheet
					{repo}
					today={today()}
					onpurged={onPurged}
					onclose={() => {
						openSheet = null
					}} />
			{/if}
		</section>
		<section class="set-section" data-section="about">
			<h2>{tr("about.title")}</h2>
			<div class="set">{@render about?.()}</div>
		</section>
	</div>
</div>
