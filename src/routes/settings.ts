import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-error-banner";
import "#components/cc-lang-switch";
import "#components/cc-settings";
import { html, nothing, render } from "lit";
import { DEFAULT_SETTINGS, type Settings } from "#lib/domain/settings";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import {
	type Backup,
	countRecords,
	exportBackup,
	type ImportCounts,
	importBackup,
	parseBackup,
	replaceWithBackup,
} from "#lib/storage/transfer";
import { bootstrap } from "#lib/ui/page";
import { createPageState } from "#lib/ui/page-state";

/**
 * Turns a repository's contents into a backup file's text and filename. Split out from the
 * click handler because `URL.createObjectURL` and a synthetic `<a>` click aren't meaningfully
 * testable outside a browser; this half is, and it's the half with logic worth covering.
 */
export async function prepareBackupFile(
	repo: Repository,
	now: Date = new Date(),
): Promise<{ filename: string; text: string }> {
	const backup = await exportBackup(repo, now);
	return {
		text: JSON.stringify(backup, null, 2),
		filename: `cc-tracking-${backup.exportedAt.slice(0, 10)}.json`,
	};
}

/** Renders the settings page into `root`, wiring it to `repo`. Exported for tests. */
export function renderSettingsPage(repo: Repository, root: HTMLElement): void {
	let settings: Settings = DEFAULT_SETTINGS;

	// A backup can carry settings, so the reload `guard` runs after an import is what brings
	// the purchases panel in step with what was just imported.
	const state = createPageState({
		fetch: async () => {
			settings = await repo.getSettings();
		},
		fallbackKey: "settings.error.read",
		paint: () => paint(),
	});

	const onSave = (event: CustomEvent<Settings>) =>
		state.guard(() => repo.saveSettings(event.detail), "settings.error.save");

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
			const { text } = await prepareBackupFile(repo);
			await navigator.clipboard.writeText(text);
			copied = true;
		}, "backup.error.copy");
	};

	// Holds the counts and filename rather than a resolved sentence, so a language switch
	// re-renders the confirmation in the new language. No filename means the text was pasted.
	let imported: ({ file?: string } & ImportCounts) | null = null;
	// Counts rather than a sentence, for the same reason: the reset question must re-render in
	// the new language if the reader switches while it is on screen.
	let resetCounts: ImportCounts | null = null;
	let resetDone = false;

	// A parsed backup waiting on the reader's merge-or-replace answer, because this browser
	// already holds records it would land on top of.
	let pending: {
		file: string | undefined;
		backup: Backup;
		existing: ImportCounts;
		incoming: ImportCounts;
	} | null = null;
	let pasteOpen = false;
	let pasteText = "";

	const finishImport = async (
		file: string | undefined,
		backup: Backup,
		write: typeof importBackup,
	) => {
		const counts = await write(repo, backup);
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
			const backup = parseBackup(text);
			const existing = await countRecords(repo);
			if (Object.values(existing).some((count) => count > 0)) {
				const incoming = {
					cards: backup.cards.length,
					purchases: backup.purchases.length,
					payments: backup.payments.length,
					limitGroups: backup.limitGroups.length,
				};
				pending = { file, backup, existing, incoming };
			} else {
				await finishImport(file, backup, importBackup);
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

	const answerImport = (write: typeof importBackup) => () => {
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

	const onStartReset = () => {
		resetDone = false;
		return state.guard(async () => {
			resetCounts = await countRecords(repo);
		}, "reset.error");
	};

	const onCancelReset = () => {
		resetCounts = null;
		paint();
	};

	const onConfirmReset = () => {
		imported = null;
		return state.guard(async () => {
			resetCounts = null;
			await repo.clearAll();
			resetDone = true;
		}, "reset.error");
	};

	const resetPanel = () =>
		resetCounts
			? html`
				<p><strong>${t("reset.confirm", resetCounts)}</strong></p>
				<div class="reset__actions">
					<button data-variant="danger" type="button" data-action="confirm-reset" @click=${onConfirmReset}>${t("reset.delete")}</button>
					<button data-variant="quiet" type="button" data-action="cancel-reset" @click=${onCancelReset}>${t("common.cancel")}</button>
				</div>
			`
			: html`<button data-variant="danger" type="button" data-action="reset" @click=${onStartReset}>${t("reset.start")}</button>`;

	// Only offered where the browser exposes them: older Firefox and plain-http pages do not.
	const canReadClipboard = () =>
		typeof navigator.clipboard?.readText === "function";
	const canWriteClipboard = () =>
		typeof navigator.clipboard?.writeText === "function";

	const saveWay = () => html`
		<section class="backup__way backup__way--save">
			<h3>${t("backup.save.title")}</h3>
			<p><small>${t("backup.save.hint")}</small></p>
			<div class="backup__actions">
				<button data-variant="quiet" type="button" @click=${onExport}>${t("backup.export")}</button>
				${
					canWriteClipboard()
						? html`<button data-variant="quiet" type="button" data-action="copy-export" @click=${onCopyExport}>${t("backup.copy")}</button>`
						: nothing
				}
			</div>
			<p class="export-status" role="status">${copied ? t("backup.copied") : nothing}</p>
		</section>
	`;

	// The restore side is one step at a time: pick a source, then (only when this browser
	// already holds records) say how the copy should land. Each step replaces the last.
	const restoreStart = () => html`
		<p><small>${t("backup.restore.hint")}</small></p>
		<div class="backup__actions">
			<label class="backup__file">${t("backup.import")}<input type="file" accept="application/json" @change=${onImport} /></label>
			<button data-variant="quiet" type="button" data-action="open-paste" @click=${onTogglePaste(true)}>${t("backup.paste")}</button>
		</div>
	`;

	const restorePaste = () => html`
		<label>${t("backup.pasteLabel")}
			<textarea class="backup__text" rows="6" spellcheck="false" .value=${pasteText} @input=${onPasteInput}></textarea>
		</label>
		<div class="backup__actions">
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
		<dl class="backup__compare">
			<div><dt>${t("backup.here")}</dt><dd>${t("backup.counts", waiting.existing)}</dd></div>
			<div><dt>${t("backup.incoming")}</dt><dd>${t("backup.counts", waiting.incoming)}</dd></div>
		</dl>
		<div class="backup__choices">
			<button class="backup__choice" type="button" data-action="merge-import" @click=${answerImport(importBackup)}>
				<strong>${t("backup.merge")}</strong>
				<span>${t("backup.mergeHint")}</span>
			</button>
			<button class="backup__choice" data-variant="danger" type="button" data-action="replace-import" @click=${answerImport(replaceWithBackup)}>
				<strong>${t("backup.replace")}</strong>
				<span>${t("backup.replaceHint")}</span>
			</button>
		</div>
		<button data-variant="quiet" type="button" data-action="cancel-import" @click=${onCancelImport}>${t("common.cancel")}</button>
	`;

	const restoreWay = () => html`
		<section class="backup__way backup__way--restore">
			<h3>${t("backup.restore.title")}</h3>
			${pending ? restoreQuestion(pending) : pasteOpen ? restorePaste() : restoreStart()}
			<p class="import-status" role="status">${importedMessage()}</p>
		</section>
	`;

	const importedMessage = () => {
		if (!imported) return nothing;
		return imported.file === undefined
			? t("backup.importedText", imported)
			: t("backup.imported", { ...imported, file: imported.file });
	};

	const paint = () =>
		render(
			html`
				<h1>${t("settings.title")}</h1>
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				<article>
					<cc-settings .settings=${settings} @save-settings=${onSave}></cc-settings>
				</article>
				<article class="backup">
					<h2>${t("backup.title")}</h2>
					<p><small>${t("backup.warning")}</small></p>
					<div class="backup__ways">
						${saveWay()}
						${restoreWay()}
					</div>
				</article>
				<article class="reset">
					<h2>${t("reset.title")}</h2>
					<p><small>${t("reset.warning")}</small></p>
					${resetPanel()}
					<p class="reset-status" role="status">${resetDone ? t("reset.done") : nothing}</p>
				</article>
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
