import "@kcstyles/reset.css";
import "../styles/tokens.css";
import "../styles/app.css";
import "#components/cc-error-banner";
import "#components/cc-lang-switch";
import { html, nothing, render } from "lit";
import { subscribe, t } from "#lib/i18n/index";
import type { Repository } from "#lib/storage/repository";
import {
	exportBackup,
	type ImportCounts,
	importBackup,
	parseBackup,
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

/** Renders the backup page into `root`, wiring it to `repo`. Exported for tests. */
export function renderBackupPage(repo: Repository, root: HTMLElement): void {
	// Nothing to read up front: this page only writes out what the repository already holds,
	// and reads a file the user picks. The state machine is here for the error banner.
	const state = createPageState({
		fetch: async () => {},
		fallbackKey: "backup.error.read",
		paint: () => paint(),
	});

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

	// Holds the counts and filename rather than a resolved sentence, so a language switch
	// re-renders the confirmation in the new language.
	let imported: ({ file: string } & ImportCounts) | null = null;

	const onImport = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		input.value = "";
		imported = null;
		return state.guard(async () => {
			const counts = await importBackup(repo, parseBackup(await file.text()));
			imported = { file: file.name, ...counts };
		}, "backup.error.import");
	};

	const paint = () =>
		render(
			html`
				<h1>${t("backup.title")}</h1>
				<cc-error-banner .message=${state.error} retry-label=${t("common.reload")} @retry=${() => state.load()}></cc-error-banner>
				<article>
					<p><small>${t("backup.warning")}</small></p>
					<button data-variant="quiet" type="button" @click=${onExport}>${t("backup.export")}</button>
					<label>${t("backup.import")} <input type="file" accept="application/json" @change=${onImport} /></label>
					<p class="import-status" role="status">${imported ? t("backup.imported", imported) : nothing}</p>
				</article>
			`,
			root,
		);

	subscribe(() => paint());
	void state.load();
}

bootstrap("title.backup", (repo) => {
	const root = document.querySelector<HTMLElement>("#page");
	if (root) renderBackupPage(repo, root);
});
