import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-error-banner";
import "#components/cc-about";
import "#components/cc-display-settings";
import "#components/cc-purge-sheet";
import "#components/cc-restore-sheet";
import { html, nothing, render } from "lit";
import type { PurgedDetail } from "#components/cc-purge-sheet";
import type { RestoredDetail } from "#components/cc-restore-sheet";
import { today } from "#lib/domain/date";
import type { LocationRecord } from "#lib/domain/types";
import { purchasePlaces } from "#lib/i18n/format";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { SEED_KEY, seedLocations } from "#lib/storage/seed-locations";
import {
	countRecordsV3,
	exportBackupV3,
	type V3Counts,
} from "#lib/storage/transfer-v3";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";

/** The name a backup file saved at `now` gets: the UTC date it was exported on. */
const backupFilename = (now: Date): string =>
	`cc-tracking-${now.toISOString().slice(0, 10)}.json`;

/**
 * Turns a repository's contents into a backup file's text and filename. Split out from the
 * click handler because `URL.createObjectURL` and a synthetic `<a>` click aren't meaningfully
 * testable outside a browser; this half is, and it's the half with logic worth covering.
 */
export async function prepareBackupFile(
	repo: Repository,
	now: Date = new Date(),
): Promise<{ filename: string; text: string }> {
	const backup = await exportBackupV3(repo, now);
	return {
		text: JSON.stringify(backup, null, 2),
		filename: backupFilename(new Date(backup.exportedAt)),
	};
}

/** The Locations row's muted line: how many places, and which of them take purchases. */
function locationsSummary(records: LocationRecord[]): string {
	const places = purchasePlaces(records);
	const count =
		records.length === 1
			? t("settings.locations.count.one")
			: t("settings.locations.count.many", { count: records.length });
	const takers =
		places.length === 0
			? t("settings.locations.takes.none")
			: t(
					places.length === 1
						? "settings.locations.takes.one"
						: "settings.locations.takes.many",
					{ places: places.join(", ") },
				);
	return t("settings.locations.summary", { count, takers });
}

/** A settings row's label with its optional muted line under it. */
const rowText = (label: string, sub?: string) =>
	html`<span class="set-row__text">${label}${
		sub ? html`<small class="set-row__sub">${sub}</small>` : nothing
	}</span>`;

/**
 * Renders the settings page into `root`, wiring it to `repo`: sections of rows in `.set`
 * panels (RD-19), Display, Locations and Backup in the main column, Reset and About beside
 * them from 900px. `storage` holds the location and payments markers, for Delete all and the
 * restore sheet alike. Exported for tests.
 */
export function renderSettingsPage(
	repo: Repository,
	root: HTMLElement,
	storage: Storage = globalThis.localStorage,
): void {
	// The Locations row sums up the stored records; everything else on the page reads
	// storage only when asked.
	let locations: LocationRecord[] = [];
	const state = createPageState({
		fetch: async () => {
			locations = await repo.listLocations();
		},
		fallbackKey: "settings.error.read",
		paint: () => paint(),
	});

	/** Which sheet is open: Restore draws `cc-restore-sheet`, Delete old purchases `cc-purge-sheet`. */
	let openSheet: "restore" | "purge" | null = null;

	const onExport = () =>
		state.guard(async () => {
			const { filename, text } = await prepareBackupFile(repo);
			const url = URL.createObjectURL(
				new Blob([text], { type: "application/json" }),
			);
			const link = document.createElement("a");
			link.href = url;
			link.download = filename;
			link.click();
			// Revoking synchronously after click() risks revoking before the browser
			// has started reading the blob (a long-standing source of dropped
			// downloads in some browsers); deferring it a tick is the safe pattern.
			setTimeout(() => URL.revokeObjectURL(url), 0);
		}, "backup.error.export");

	let copied = false;

	const onCopyExport = () => {
		copied = false;
		return state.guard(async () => {
			// Compact, unlike the file: pasted text is carried around, not read, so skip the indent.
			await navigator.clipboard.writeText(
				JSON.stringify(await exportBackupV3(repo, new Date())),
			);
			copied = true;
		}, "backup.error.copy");
	};

	// Holds the counts and filename rather than a resolved sentence, so a language switch
	// re-renders the confirmation in the new language. No filename means the text was pasted.
	let imported: RestoredDetail | null = null;
	// Counts rather than a sentence, for the same reason: the reset warning must re-render in
	// the new language if the reader switches while it is on screen.
	let resetCounts: V3Counts | null = null;
	let resetDone = false;
	// What the purge sheet deleted, kept as counts so the sentence follows a language switch.
	let purged: PurgedDetail | null = null;

	/** The restore sheet wrote a copy: show its counts, and read the locations again. */
	const onRestored = (event: CustomEvent<RestoredDetail>) => {
		imported = event.detail;
		resetDone = false;
		purged = null;
		openSheet = null;
		void state.load();
	};

	/** The purge sheet deleted old purchases: say how many in the Reset panel. */
	const onPurged = (event: CustomEvent<PurgedDetail>) => {
		purged = event.detail;
		resetDone = false;
		openSheet = null;
		paint();
	};

	/** Takes a sheet away; it forgets its steps, so the next one opens fresh. */
	const onCloseSheet = () => {
		openSheet = null;
		paint();
	};

	/** Opens `sheet`, or closes it when it is already open. */
	const onToggleSheet = (sheet: "restore" | "purge") => () => {
		openSheet = openSheet === sheet ? null : sheet;
		paint();
	};

	const onStartReset = () => {
		resetDone = false;
		purged = null;
		return state.guard(async () => {
			resetCounts = await countRecordsV3(repo);
		}, "reset.error");
	};

	const onCancelReset = () => {
		resetCounts = null;
		paint();
	};

	const onConfirmReset = () => {
		imported = null;
		purged = null;
		return state.guard(async () => {
			resetCounts = null;
			await repo.clearAll();
			// Seed the starting places again, so Home and the Locations page are not empty. The
			// marker goes first: an in-memory repository's clearAll leaves storage alone.
			storage.removeItem(SEED_KEY);
			await seedLocations(repo, storage);
			resetDone = true;
		}, "reset.error");
	};

	// Only offered where the browser exposes it: older Firefox and plain-http pages do not.
	const canWriteClipboard = () =>
		typeof navigator.clipboard?.writeText === "function";

	const importedMessage = () => {
		if (!imported) return nothing;
		return imported.file === undefined
			? t("backup.importedText", imported)
			: t("backup.imported", { ...imported, file: imported.file });
	};

	const purgedMessage = () =>
		purged
			? t(purged.count === 1 ? "purge.done.one" : "purge.done.many", {
					count: purged.count,
					age: t(`purge.span.${purged.age}`),
				})
			: nothing;

	/** A section: its heading over one `.set` panel of rows, then anything `after` it. */
	const section = (
		name: string,
		title: string,
		rows: unknown,
		after: unknown = nothing,
	) => html`
		<section class="set-section" data-section=${name}>
			<h2>${title}</h2>
			<div class="set">${rows}</div>
			${after}
		</section>
	`;

	const displaySection = () =>
		section(
			"display",
			t("settings.display.title"),
			html`<cc-display-settings></cc-display-settings>`,
		);

	const locationsSection = () =>
		section(
			"locations",
			t("settings.locations.title"),
			html`<a class="set-row" data-row="locations" href="/settings/locations">
				${rowText(t("settings.locations.manage"), locationsSummary(locations))}
				<span class="set-row__chev" aria-hidden="true">›</span>
			</a>`,
		);

	const backupSection = () =>
		section(
			"backup",
			t("backup.title"),
			html`
				<button class="set-row" type="button" data-row="download" @click=${onExport}>
					${rowText(t("settings.backup.download"), backupFilename(new Date()))}
					<span class="set-row__action">${t("settings.backup.downloadAction")}</span>
				</button>
				${
					canWriteClipboard()
						? html`<button class="set-row" type="button" data-row="copy" @click=${onCopyExport}>
							${rowText(t("settings.backup.copy"), t("settings.backup.copyHint"))}
							<span class="set-row__action" data-variant="quiet" aria-live="polite">${
								copied
									? t("settings.backup.copied")
									: t("settings.backup.copyAction")
							}</span>
						</button>`
						: nothing
				}
				<button class="set-row" type="button" data-row="restore" aria-haspopup="dialog" aria-expanded=${openSheet === "restore"} @click=${onToggleSheet("restore")}>
					${rowText(t("backup.restore.title"), t("settings.backup.restoreHint"))}
					<span class="set-row__action" data-variant="quiet">${t("settings.backup.restoreAction")}</span>
				</button>
			`,
			html`<p class="set-note">${t("backup.warning")}</p>
				<p class="import-status" role="status">${importedMessage()}</p>
				${
					openSheet === "restore"
						? html`<cc-restore-sheet .repo=${repo} .storage=${storage}
							@restored=${onRestored} @close=${onCloseSheet}></cc-restore-sheet>`
						: nothing
				}`,
		);

	const resetSection = () =>
		section(
			"reset",
			t("reset.title"),
			html`
				<button class="set-row" type="button" data-row="purge" aria-haspopup="dialog" aria-expanded=${openSheet === "purge"} @click=${onToggleSheet("purge")}>
					${rowText(t("settings.reset.purge"), t("settings.reset.purgeHint"))}
					<span class="set-row__action" data-variant="quiet">${t("settings.reset.purgeAction")}</span>
				</button>
				${
					resetCounts === null
						? html`<button class="set-row" type="button" data-row="delete-all" @click=${onStartReset}>
							${rowText(t("settings.reset.all"), t("settings.reset.allHint"))}
							<span class="set-row__action" data-variant="danger">${t("settings.reset.allAction")}</span>
						</button>`
						: html`<div class="set-ask">
							<p class="set-ask__note">${t("reset.ask", {
								counts: t("backup.counts", resetCounts),
							})}</p>
							<div class="set-ask__actions">
								<button type="button" data-action="keep-data" @click=${onCancelReset}>${t("reset.keep")}</button>
								<button data-variant="danger" type="button" data-action="delete-everything" @click=${onConfirmReset}>${t("reset.deleteEverything")}</button>
							</div>
						</div>`
				}
			`,
			html`<p class="reset-status" role="status">${
				resetDone ? t("reset.done") : purgedMessage()
			}</p>
				${
					openSheet === "purge"
						? html`<cc-purge-sheet .repo=${repo} .today=${today()}
							@purged=${onPurged} @close=${onCloseSheet}></cc-purge-sheet>`
						: nothing
				}`,
		);

	const paint = () =>
		render(
			html`
				<h1>${t("settings.title")}</h1>
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				<div class="settings-grid">
					<div class="settings-grid__main">
						${displaySection()}
						${locationsSection()}
						${backupSection()}
					</div>
					<div class="settings-grid__side">
						${resetSection()}
						${section("about", t("about.title"), html`<cc-about></cc-about>`)}
					</div>
				</div>
			`,
			root,
		);

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.settings", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderSettingsPage(repo, root);
});
