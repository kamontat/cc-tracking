<script lang="ts">
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { BackupV4, V4Counts } from "#lib/storage/transfer-v4"
	import type { RestoredDetail, RestoreStep } from "#lib/ui/restore"

	import { onMount } from "svelte"

	import Sheet from "#components/molecules/Sheet.svelte"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { migrateLocations } from "#lib/storage/migrate-locations"
	import { migrateOwners } from "#lib/storage/migrate-owners"
	import { seedLocations } from "#lib/storage/seed-locations"
	import { seedOwners } from "#lib/storage/seed-owners"
	import {
		backupCounts,
		countRecordsV4,
		importBackupV4,
		onlySeededDefaults,
		onlySeededOwners,
		parseAnyBackup,
		replaceWithBackupV4,
	} from "#lib/storage/transfer-v4"
	import { countsText } from "#lib/ui/record-counts"
	import { canReadClipboard, fetchBackupText, linkName, restoreFailureText } from "#lib/ui/restore"

	/**
	 * *Restore a copy*, clipboard first, in a sheet. The start offers *Paste from clipboard*
	 * (primary), *Choose a file*, *From a link* and *Paste by hand*; a browser that cannot read the
	 * clipboard opens on the text area instead, with *From a link* under it. *From a link* fetches
	 * the address typed in and names the copy by the link's file. The clipboard and a file are
	 * parsed at once. Into an empty
	 * browser (no records, and locations only the untouched starting places) the copy goes in
	 * straight away, its locations over the seeded ones; otherwise the sheet shows both counts
	 * and asks *Merge* or *Replace*. After any write the starting locations are seeded and every
	 * card is pointed at a stored location, then the sheet slides away and `onrestored` runs.
	 * Close, Escape, the backdrop and *Cancel* call `onclose`; the page takes the sheet away, so
	 * a reopened one starts fresh.
	 */
	interface Props {
		repo: Repository
		/** Where the location and payments markers live. */
		storage?: Storage
		/** The copy is in and the sheet has slid away; the page takes it off screen. */
		onrestored: (detail: RestoredDetail) => void
		/** The reader closed it; the page takes it off screen. */
		onclose: () => void
	}

	const { repo, storage = globalThis.localStorage, onrestored, onclose }: Props = $props()

	/** A parsed copy waiting on the merge-or-replace answer. No `file` means it was pasted. */
	type Pending = { file: string | undefined; backup: BackupV4; existing: V4Counts; incoming: V4Counts }

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}
	const counts = (value: V4Counts) => {
		void lang
		return countsText(value)
	}

	let sheet: { leave: (then: () => void) => void } | undefined = $state()
	/** Whether the start step is on offer; without it the sheet opens on the text area. */
	const clipboard = canReadClipboard()
	let step = $state<RestoreStep>(clipboard ? "start" : "paste")
	let text = $state("")
	let link = $state("")
	/** The clipboard read was refused, so the text area says to paste by hand. */
	let refused = $state(false)
	/** Why the last parse or write failed, kept raw so a language switch re-translates it. */
	let failure = $state.raw<unknown>(null)
	let pending = $state.raw<Pending | null>(null)
	/** A read or write is under way: buttons wait and the sheet holds open. */
	let busy = $state(false)
	/** The copy is in and the sheet is sliding away: it stays busy until it is gone. */
	let leaving = false

	const failureText = $derived.by(() => {
		void lang
		return failure === null ? "" : restoreFailureText(failure)
	})

	/** Runs `work` with the buttons waiting, keeping any failure to show in the sheet. */
	const run = async (work: () => Promise<void>) => {
		if (busy) return
		busy = true
		failure = null
		try {
			await work()
		} catch (caught) {
			failure = caught
		} finally {
			if (!leaving) busy = false
		}
	}

	/**
	 * Writes the copy, then makes sure every card has a stored location to point at (a copy can
	 * bring cards without their records), and lets the sheet slide away before `onrestored`.
	 */
	const finish = async (
		file: string | undefined,
		backup: BackupV4,
		write: (repo: Repository, backup: BackupV4) => Promise<void>,
	) => {
		await write(repo, backup)
		await seedLocations(repo, storage)
		await migrateLocations(repo, storage)
		await seedOwners(repo, storage)
		await migrateOwners(repo)
		const restored = backupCounts(backup)
		const detail: RestoredDetail = file === undefined ? restored : { file, ...restored }
		leaving = true
		const emit = () => onrestored(detail)
		if (sheet) sheet.leave(emit)
		else emit()
	}

	/** Parses `text`, then restores it at once into an empty browser or asks first otherwise. */
	const start = async (file: string | undefined, source: string) => {
		const backup = parseAnyBackup(source)
		const existing = await countRecordsV4(repo)
		const empty =
			Object.values(existing).every((count) => count === 0) &&
			onlySeededDefaults(await repo.listLocations()) &&
			onlySeededOwners(await repo.listOwners())
		if (empty) {
			await finish(file, backup, (store, copy) => importBackupV4(store, copy, { overSeeded: true }))
		} else {
			pending = { file, backup, existing, incoming: backupCounts(backup) }
			step = "question"
		}
	}

	const onClipboard = () =>
		run(async () => {
			let read: string
			try {
				read = await navigator.clipboard.readText()
			} catch {
				refused = true
				step = "paste"
				return
			}
			await start(undefined, read)
		})

	const onFile = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement
		const file = input.files?.[0]
		if (!file) return
		input.value = ""
		return run(async () => start(file.name, await file.text()))
	}

	const onLink = () => run(async () => start(linkName(link), await fetchBackupText(link)))

	/** Moves to `next`, leaving the last failure behind. */
	const goTo = (next: RestoreStep) => {
		failure = null
		step = next
	}

	const answer = (replace: boolean) => {
		const waiting = pending
		if (!waiting) return
		return run(() =>
			finish(waiting.file, waiting.backup, (store, backup) =>
				replace ? replaceWithBackupV4(store, backup) : importBackupV4(store, backup),
			),
		)
	}

	const onCancel = () => {
		if (sheet) sheet.leave(onclose)
		else onclose()
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<Sheet bind:this={sheet} heading={tr("backup.restore.title")} held={busy} {onclose}>
	{#if failure !== null}
		<p role="alert">{failureText}</p>
	{/if}
	{#if step === "question" && pending}
		<div class="step" data-step="question">
			<p class="ask">
				{pending.file === undefined ? tr("backup.question.pasted") : tr("backup.question.file", { file: pending.file })}
			</p>
			<dl class="compare">
				<div>
					<dt>{tr("backup.here")}</dt>
					<dd>{counts(pending.existing)}</dd>
				</div>
				<div>
					<dt>{tr("backup.incoming")}</dt>
					<dd>{counts(pending.incoming)}</dd>
				</div>
			</dl>
			<button type="button" class="choice" data-action="merge-import" disabled={busy} onclick={() => answer(false)}>
				<strong>{tr("backup.merge")}</strong>
				<span>{tr("backup.mergeHint")}</span>
			</button>
			<button
				type="button"
				class="choice"
				data-variant="danger"
				data-action="replace-import"
				disabled={busy}
				onclick={() => answer(true)}>
				<strong>{tr("backup.replace")}</strong>
				<span>{tr("backup.replaceHint")}</span>
			</button>
			<button type="button" data-variant="quiet" data-action="cancel" disabled={busy} onclick={onCancel}>
				{tr("common.cancel")}
			</button>
		</div>
	{:else if step === "paste"}
		<div class="step" data-step="paste">
			{#if refused}
				<p class="hint">{tr("backup.clipboardRefused")}</p>
			{/if}
			<label>
				{tr("backup.pasteLabel")}
				<textarea rows="6" spellcheck="false" bind:value={text}></textarea>
			</label>
			<button type="button" data-action="import-text" disabled={busy} onclick={() => run(() => start(undefined, text))}>
				{tr("backup.importText")}
			</button>
			{#if !clipboard}
				<button
					type="button"
					class="by-hand"
					data-variant="quiet"
					data-action="from-link"
					disabled={busy}
					onclick={() => goTo("link")}>
					{tr("backup.fromLink")}
				</button>
			{/if}
		</div>
	{:else if step === "link"}
		<form
			class="step"
			data-step="link"
			novalidate
			onsubmit={(event) => {
				event.preventDefault()
				onLink()
			}}>
			<label>
				{tr("backup.linkLabel")}
				<input type="url" inputmode="url" autocomplete="off" spellcheck="false" bind:value={link}>
			</label>
			<p class="hint">{tr("backup.linkHint")}</p>
			<button type="submit" data-action="import-link" disabled={busy}>{tr("backup.importText")}</button>
		</form>
	{:else}
		<div class="step" data-step="start">
			<button type="button" data-action="paste-clipboard" disabled={busy} onclick={onClipboard}>
				{tr("backup.fromClipboard")}
			</button>
			<label class="file">
				{tr("backup.import")}
				<input type="file" accept="application/json" data-action="choose-file" disabled={busy} onchange={onFile}>
			</label>
			<button type="button" data-variant="quiet" data-action="from-link" disabled={busy} onclick={() => goTo("link")}>
				{tr("backup.fromLink")}
			</button>
			<button
				type="button"
				class="by-hand"
				data-variant="quiet"
				data-action="paste-by-hand"
				disabled={busy}
				onclick={() => goTo("paste")}>
				{tr("backup.paste")}
			</button>
		</div>
	{/if}
</Sheet>

<style>
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

	/* The file picker, dressed as a quiet button. The input is clipped out of sight but kept in
	   the layout and the tab order, so the label's focus ring follows the keyboard. */
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

	.step textarea,
	.step input[type="url"] {
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

	/* Each answer is a whole button carrying its consequence, so nobody picks Replace without
	   reading what it does. */
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
</style>
