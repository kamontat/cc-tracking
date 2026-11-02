import "#components/cc-modal";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { LocaleController } from "#lib/i18n/controller";
import { messageOf } from "#lib/i18n/error";
import { t } from "#lib/i18n/index";
import { migrateLocations } from "#lib/storage/migrate-locations";
import type { Repository } from "#lib/storage/repository";
import { seedLocations } from "#lib/storage/seed-locations";
import {
	type BackupV3,
	backupCounts,
	countRecordsV3,
	importBackupV3,
	onlySeededDefaults,
	parseAnyBackup,
	replaceWithBackupV3,
	type V3Counts,
} from "#lib/storage/transfer-v3";
import { countsText } from "#lib/ui/record-counts";
import { base, controls } from "#styles/shared";

/** Where the sheet is: picking a source, typing text in, or asking merge or replace. */
export type RestoreStep = "start" | "paste" | "question";

/** What `restored` carries: what the copy held, and the file's name when it came from one. */
export type RestoredDetail = { file?: string } & V3Counts;

/** A parsed copy waiting on the merge-or-replace answer. No `file` means it was pasted. */
type Pending = {
	file: string | undefined;
	backup: BackupV3;
	existing: V3Counts;
	incoming: V3Counts;
};

// Older Firefox and plain-http pages do not expose it.
const canReadClipboard = (): boolean =>
	typeof navigator.clipboard?.readText === "function";

/**
 * *Restore a copy*, clipboard first, in a sheet. The start offers *Paste from clipboard*
 * (primary), *Choose a file* and *Paste by hand*; a browser that cannot read the clipboard
 * opens on the text area instead. The clipboard and a file are parsed at once. Into an empty
 * browser (no records, and locations only the untouched starting places) the copy goes in
 * straight away, its locations over the seeded ones; over existing records, or a renamed or
 * added location, the sheet shows both counts and asks *Merge* or *Replace*. After any write the starting locations are seeded and every
 * card is pointed at a stored location, then the sheet slides away and emits `restored`
 * (`RestoredDetail`). Close, Escape, the backdrop and *Cancel* emit `close`; the page takes the
 * sheet away, so a reopened one starts fresh.
 */
@customElement("cc-restore-sheet")
export class CcRestoreSheet extends LitElement {
	static override styles = [
		base,
		controls,
		css`
			:host {
				display: contents;
			}

			.step {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-3);
			}

			.step > button,
			.file {
				align-self: stretch;
				padding: var(--cc-space-3) var(--cc-space-4);
				font-size: var(--cc-text-md);
				font-weight: 650;
				text-align: center;
			}

			/* The file picker, dressed as a quiet button. The input is clipped out of sight but
			   kept in the layout and the tab order, so the label's focus ring follows the keyboard. */
			.file {
				position: relative;
				display: block;
				color: var(--cc-text);
				cursor: pointer;
				background: var(--cc-surface-sunken);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-sm);
			}

			.file:hover {
				background: var(--cc-border);
			}

			.file:focus-within {
				box-shadow: var(--cc-focus-ring);
			}

			.file input {
				position: absolute;
				inset: 0;
				inline-size: 100%;
				block-size: 100%;
				padding: 0;
				cursor: pointer;
				opacity: 0;
			}

			/* *Paste by hand* reads as a text link, the least of the three ways in. */
			.step > .by-hand {
				align-self: center;
				padding: var(--cc-space-1);
				font-size: var(--cc-text-sm);
				font-weight: 400;
				color: var(--cc-link);
				text-decoration: underline;
				background: transparent;
				border-color: transparent;
			}

			.step > .by-hand:hover {
				background: transparent;
			}

			textarea {
				inline-size: 100%;
				padding: var(--cc-space-2);
				font-family: var(--cc-font-mono);
				font-size: var(--cc-text-xs);
				color: var(--cc-text);
				resize: vertical;
				background: var(--cc-surface);
				border: var(--cc-border-width) solid var(--cc-border);
				border-radius: var(--cc-radius-sm);
			}

			.hint {
				font-size: var(--cc-text-sm);
				color: var(--cc-text-muted);
			}

			.ask {
				font-weight: 600;
			}

			/* What is here against what is coming in, so the choice is an informed one. */
			.compare {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-2);
				margin: 0;
				padding: var(--cc-space-2) var(--cc-space-3);
				background: var(--cc-surface);
				border-radius: var(--cc-radius-sm);
			}

			.compare dt {
				font-size: var(--cc-text-xs);
				color: var(--cc-text-muted);
			}

			.compare dd {
				margin: 0;
				font-size: var(--cc-text-sm);
			}

			/* Each answer is a whole button carrying its consequence, so nobody picks Replace
			   without reading what it does. */
			.step > .choice {
				display: flex;
				flex-direction: column;
				gap: var(--cc-space-1);
				text-align: start;
				white-space: normal;
			}

			.choice span {
				font-size: var(--cc-text-sm);
				font-weight: 400;
			}
		`,
	];

	@property({ attribute: false }) repo!: Repository;
	/** Where the location and payments markers live. */
	@property({ attribute: false }) storage: Storage = globalThis.localStorage;

	@state() private step: RestoreStep = canReadClipboard() ? "start" : "paste";
	@state() private text = "";
	/** The clipboard read was refused, so the text area says to paste by hand. */
	@state() private refused = false;
	/** Why the last parse or write failed, kept raw so a language switch re-translates it. */
	@state() private failure: unknown = null;
	@state() private pending: Pending | null = null;
	/** A read or write is under way: buttons wait and the sheet holds open. */
	@state() private busy = false;
	/** The copy is in and the sheet is sliding away: it stays busy until it is gone. */
	private leaving = false;

	constructor() {
		super();
		new LocaleController(this);
	}

	/** Runs `work` with the buttons waiting, keeping any failure to show in the sheet. */
	private async run(work: () => Promise<void>) {
		if (this.busy) return;
		this.busy = true;
		this.failure = null;
		try {
			await work();
		} catch (failure) {
			this.failure = failure;
		} finally {
			if (!this.leaving) this.busy = false;
		}
	}

	/** Parses `text`, then restores it at once into an empty browser or asks first otherwise. */
	private async start(file: string | undefined, text: string) {
		const backup = parseAnyBackup(text);
		const existing = await countRecordsV3(this.repo);
		const empty =
			Object.values(existing).every((count) => count === 0) &&
			onlySeededDefaults(await this.repo.listLocations());
		if (empty) {
			await this.finish(file, backup, (repo, copy) =>
				importBackupV3(repo, copy, { overSeeded: true }),
			);
		} else {
			this.pending = { file, backup, existing, incoming: backupCounts(backup) };
			this.step = "question";
		}
	}

	/**
	 * Writes the copy, then makes sure every card has a stored location to point at (a copy can
	 * bring cards without their records), and lets the sheet slide away before `restored`.
	 */
	private async finish(
		file: string | undefined,
		backup: BackupV3,
		write: (repo: Repository, backup: BackupV3) => Promise<void>,
	) {
		await write(this.repo, backup);
		await seedLocations(this.repo, this.storage);
		await migrateLocations(this.repo, this.storage);
		const counts = backupCounts(backup);
		const detail: RestoredDetail =
			file === undefined ? counts : { file, ...counts };
		const emit = () =>
			this.dispatchEvent(
				new CustomEvent<RestoredDetail>("restored", { detail }),
			);
		this.leaving = true;
		const sheet = this.renderRoot.querySelector("cc-modal");
		if (sheet) sheet.leave(emit);
		else emit();
	}

	private onClipboard() {
		return this.run(async () => {
			let text: string;
			try {
				text = await navigator.clipboard.readText();
			} catch {
				this.refused = true;
				this.step = "paste";
				return;
			}
			await this.start(undefined, text);
		});
	}

	private onFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		input.value = "";
		return this.run(async () => this.start(file.name, await file.text()));
	}

	private answer(replace: boolean) {
		const waiting = this.pending;
		if (!waiting) return;
		return this.run(() =>
			this.finish(waiting.file, waiting.backup, (repo, backup) =>
				replace
					? replaceWithBackupV3(repo, backup, this.storage)
					: importBackupV3(repo, backup),
			),
		);
	}

	private onCancel(event: Event) {
		const sheet = (event.currentTarget as HTMLElement).closest("cc-modal");
		const close = () => this.dispatchEvent(new CustomEvent("close"));
		if (sheet) sheet.leave(close);
		else close();
	}

	private startStep() {
		return html`<div class="step" data-step="start">
			<button type="button" data-action="paste-clipboard" ?disabled=${this.busy}
				@click=${this.onClipboard}>${t("backup.fromClipboard")}</button>
			<label class="file">${t("backup.import")}<input type="file"
				accept="application/json" data-action="choose-file" ?disabled=${this.busy}
				@change=${this.onFile} /></label>
			<button type="button" class="by-hand" data-variant="quiet" data-action="paste-by-hand"
				?disabled=${this.busy} @click=${() => {
					this.failure = null;
					this.step = "paste";
				}}>${t("backup.paste")}</button>
		</div>`;
	}

	private pasteStep() {
		return html`<div class="step" data-step="paste">
			${this.refused ? html`<p class="hint">${t("backup.clipboardRefused")}</p>` : nothing}
			<label>${t("backup.pasteLabel")}
				<textarea rows="6" spellcheck="false" .value=${this.text}
					@input=${(event: Event) => {
						this.text = (event.target as HTMLTextAreaElement).value;
					}}></textarea></label>
			<button type="button" data-action="import-text" ?disabled=${this.busy}
				@click=${() => this.run(() => this.start(undefined, this.text))}>${t(
					"backup.importText",
				)}</button>
		</div>`;
	}

	private questionStep(waiting: Pending) {
		return html`<div class="step" data-step="question">
			<p class="ask">${
				waiting.file === undefined
					? t("backup.question.pasted")
					: t("backup.question.file", { file: waiting.file })
			}</p>
			<dl class="compare">
				<div><dt>${t("backup.here")}</dt><dd>${countsText(waiting.existing)}</dd></div>
				<div><dt>${t("backup.incoming")}</dt><dd>${countsText(waiting.incoming)}</dd></div>
			</dl>
			<button type="button" class="choice" data-action="merge-import" ?disabled=${this.busy}
				@click=${() => this.answer(false)}>
				<strong>${t("backup.merge")}</strong>
				<span>${t("backup.mergeHint")}</span>
			</button>
			<button type="button" class="choice" data-variant="danger" data-action="replace-import"
				?disabled=${this.busy} @click=${() => this.answer(true)}>
				<strong>${t("backup.replace")}</strong>
				<span>${t("backup.replaceHint")}</span>
			</button>
			<button type="button" data-variant="quiet" data-action="cancel"
				?disabled=${this.busy} @click=${this.onCancel}>${t("common.cancel")}</button>
		</div>`;
	}

	/** The lead sentence, then why, unless the reason is that same sentence again. */
	private failureText(): string {
		const lead = t("backup.error.import");
		const reason = messageOf(this.failure, "backup.error.import");
		return reason === lead ? lead : `${lead} ${reason}`;
	}

	override render() {
		const waiting = this.pending;
		return html`<cc-modal sheet .held=${this.busy} heading=${t("backup.restore.title")}
			@close=${(event: Event) => {
				event.stopPropagation();
				this.dispatchEvent(new CustomEvent("close"));
			}}>
			${
				this.failure === null
					? nothing
					: html`<p role="alert">${this.failureText()}</p>`
			}
			${
				this.step === "question" && waiting
					? this.questionStep(waiting)
					: this.step === "paste"
						? this.pasteStep()
						: this.startStep()
			}
		</cc-modal>`;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"cc-restore-sheet": CcRestoreSheet;
	}
}
