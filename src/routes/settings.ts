import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-error-banner";
import "#components/cc-about";
import "#components/cc-display-settings";
import { html, nothing, render } from "lit";
import type { LocationRecord } from "#lib/domain/types";
import { purchasePlaces } from "#lib/i18n/format";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import { SEED_KEY, seedLocations } from "#lib/storage/seed-locations";
import {
	type BackupV3,
	backupCounts,
	countRecordsV3,
	exportBackupV3,
	importBackupV3,
	parseAnyBackup,
	replaceWithBackupV3,
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
 * them from 900px. Exported for tests.
 */
export function renderSettingsPage(repo: Repository, root: HTMLElement): void {
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

	/**
	 * Which step-by-step panel is open. Restore shows its steps under its row; Delete old
	 * purchases has no panel of its own yet, so choosing it only records the choice.
	 */
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
	let imported: ({ file?: string } & V3Counts) | null = null;
	// A count rather than a sentence, for the same reason: the reset warning must re-render in
	// the new language if the reader switches while it is on screen.
	let resetCards: number | null = null;
	let resetDone = false;

	// A parsed backup waiting on the reader's merge-or-replace answer, because this browser
	// already holds records it would land on top of.
	let pending: {
		file: string | undefined;
		backup: BackupV3;
		existing: V3Counts;
		incoming: V3Counts;
	} | null = null;
	let pasteOpen = false;
	let pasteText = "";

	type BackupWriter = (repo: Repository, backup: BackupV3) => Promise<void>;
	const replaceWriter: BackupWriter = (target, backup) =>
		replaceWithBackupV3(target, backup, globalThis.localStorage);

	const finishImport = async (
		file: string | undefined,
		backup: BackupV3,
		write: BackupWriter,
	) => {
		await write(repo, backup);
		const counts = backupCounts(backup);
		imported = file === undefined ? counts : { file, ...counts };
		pending = null;
		if (file === undefined) {
			pasteOpen = false;
			pasteText = "";
		}
	};

	/** Parses `text`, then imports it at once into an empty browser or asks first otherwise. */
	const startImport = (file: string | undefined, text: string) => {
		imported = null;
		pending = null;
		resetDone = false;
		return state.guard(async () => {
			const backup = parseAnyBackup(text);
			const existing = await countRecordsV3(repo);
			if (Object.values(existing).some((count) => count > 0)) {
				pending = { file, backup, existing, incoming: backupCounts(backup) };
			} else {
				await finishImport(file, backup, importBackupV3);
			}
		}, "backup.error.import");
	};

	const onImport = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		input.value = "";
		return startImport(file.name, await file.text());
	};

	const onImportText = () => startImport(undefined, pasteText);

	const answerImport = (write: BackupWriter) => () => {
		const waiting = pending;
		if (!waiting) return;
		return state.guard(
			() => finishImport(waiting.file, waiting.backup, write),
			"backup.error.import",
		);
	};

	const onCancelImport = () => {
		pending = null;
		paint();
	};

	const onTogglePaste = (open: boolean) => () => {
		pasteOpen = open;
		if (!open) pasteText = "";
		paint();
	};

	const onPasteInput = (event: Event) => {
		pasteText = (event.target as HTMLTextAreaElement).value;
	};

	const onReadClipboard = () =>
		state.guard(async () => {
			pasteText = await navigator.clipboard.readText();
		}, "backup.error.clipboard");

	/** Opens `sheet`, or closes it when it is already open. */
	const onToggleSheet = (sheet: "restore" | "purge") => () => {
		openSheet = openSheet === sheet ? null : sheet;
		paint();
	};

	const onStartReset = () => {
		resetDone = false;
		return state.guard(async () => {
			resetCards = (await countRecordsV3(repo)).cards;
		}, "reset.error");
	};

	const onCancelReset = () => {
		resetCards = null;
		paint();
	};

	const onConfirmReset = () => {
		imported = null;
		return state.guard(async () => {
			resetCards = null;
			await repo.clearAll();
			// Seed the starting places again, so Home and the Locations page are not empty. The
			// marker goes first: an in-memory repository's clearAll leaves storage alone.
			globalThis.localStorage.removeItem(SEED_KEY);
			await seedLocations(repo, globalThis.localStorage);
			resetDone = true;
		}, "reset.error");
	};

	// Only offered where the browser exposes them: older Firefox and plain-http pages do not.
	const canReadClipboard = () =>
		typeof navigator.clipboard?.readText === "function";
	const canWriteClipboard = () =>
		typeof navigator.clipboard?.writeText === "function";

	// The restore steps, one at a time: pick a source, then (only when this browser already
	// holds records) say how the copy should land. Each step replaces the last.
	const restoreStart = () => html`
		<div class="restore__actions">
			<label class="restore__file">${t("backup.import")}<input type="file" accept="application/json" @change=${onImport} /></label>
			<button data-variant="quiet" type="button" data-action="open-paste" @click=${onTogglePaste(true)}>${t("backup.paste")}</button>
		</div>
	`;

	const restorePaste = () => html`
		<label>${t("backup.pasteLabel")}
			<textarea class="restore__text" rows="6" spellcheck="false" .value=${pasteText} @input=${onPasteInput}></textarea>
		</label>
		<div class="restore__actions">
			<button type="button" data-action="import-text" @click=${onImportText}>${t("backup.importText")}</button>
			${
				canReadClipboard()
					? html`<button data-variant="quiet" type="button" data-action="read-clipboard" @click=${onReadClipboard}>${t("backup.fromClipboard")}</button>`
					: nothing
			}
			<button data-variant="quiet" type="button" data-action="close-paste" @click=${onTogglePaste(false)}>${t("common.cancel")}</button>
		</div>
	`;

	const restoreQuestion = (waiting: NonNullable<typeof pending>) => html`
		<p><strong>${
			waiting.file === undefined
				? t("backup.question.pasted")
				: t("backup.question.file", { file: waiting.file })
		}</strong></p>
		<dl class="restore__compare">
			<div><dt>${t("backup.here")}</dt><dd>${t("backup.counts", waiting.existing)}</dd></div>
			<div><dt>${t("backup.incoming")}</dt><dd>${t("backup.counts", waiting.incoming)}</dd></div>
		</dl>
		<div class="restore__choices">
			<button class="restore__choice" type="button" data-action="merge-import" @click=${answerImport(importBackupV3)}>
				<strong>${t("backup.merge")}</strong>
				<span>${t("backup.mergeHint")}</span>
			</button>
			<button class="restore__choice" data-variant="danger" type="button" data-action="replace-import" @click=${answerImport(replaceWriter)}>
				<strong>${t("backup.replace")}</strong>
				<span>${t("backup.replaceHint")}</span>
			</button>
		</div>
		<button data-variant="quiet" type="button" data-action="cancel-import" @click=${onCancelImport}>${t("common.cancel")}</button>
	`;

	const restoreSteps = () => html`
		<div class="restore">
			${pending ? restoreQuestion(pending) : pasteOpen ? restorePaste() : restoreStart()}
		</div>
	`;

	const importedMessage = () => {
		if (!imported) return nothing;
		return imported.file === undefined
			? t("backup.importedText", imported)
			: t("backup.imported", { ...imported, file: imported.file });
	};

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
				<button class="set-row" type="button" data-row="restore" aria-expanded=${openSheet === "restore" ? "true" : "false"} @click=${onToggleSheet("restore")}>
					${rowText(t("backup.restore.title"), t("settings.backup.restoreHint"))}
					<span class="set-row__action" data-variant="quiet">${t("settings.backup.restoreAction")}</span>
				</button>
				${openSheet === "restore" ? restoreSteps() : nothing}
			`,
			html`<p class="import-status" role="status">${importedMessage()}</p>`,
		);

	const resetSection = () =>
		section(
			"reset",
			t("reset.title"),
			html`
				<button class="set-row" type="button" data-row="purge" @click=${onToggleSheet("purge")}>
					${rowText(t("settings.reset.purge"), t("settings.reset.purgeHint"))}
					<span class="set-row__action" data-variant="quiet">${t("settings.reset.purgeAction")}</span>
				</button>
				${
					resetCards === null
						? html`<button class="set-row" type="button" data-row="delete-all" @click=${onStartReset}>
							${rowText(t("settings.reset.all"), t("settings.reset.allHint"))}
							<span class="set-row__action" data-variant="danger">${t("settings.reset.allAction")}</span>
						</button>`
						: html`<div class="set-ask">
							<p class="set-ask__note">${
								resetCards === 1
									? t("reset.ask.one")
									: t("reset.ask.many", { count: resetCards })
							}</p>
							<div class="set-ask__actions">
								<button type="button" data-action="keep-data" @click=${onCancelReset}>${t("reset.keep")}</button>
								<button data-variant="danger" type="button" data-action="delete-everything" @click=${onConfirmReset}>${t("reset.deleteEverything")}</button>
							</div>
						</div>`
				}
			`,
			html`<p class="reset-status" role="status">${resetDone ? t("reset.done") : nothing}</p>`,
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
