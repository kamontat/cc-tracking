<script lang="ts">
	import type { PurgeAge } from "#lib/domain/purge"
	import type { PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { PurgedDetail } from "#lib/ui/purge"

	import { onMount } from "svelte"

	import Sheet from "#components/molecules/Sheet.svelte"
	import { displayDate } from "#lib/domain/date"
	import { messageOf } from "#lib/i18n/error"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { applyPurge, previewPurge } from "#lib/storage/purge-run"
	import { PURGE_AGES } from "#lib/ui/purge"

	/**
	 * *Clean old data* (RD-18), in a sheet. Chips pick how old (a year by default) and each
	 * choice recounts; a note says how many purchases go and before which date, and how many older
	 * ones stay because their statement is not fully paid. *Delete N purchases…* swaps to a second
	 * ask, *Keep them* or *Yes, delete N*. Yes writes the plan, lets the sheet slide away and calls
	 * `onpurged`; the buttons stay held until the page takes the sheet away. Close, Escape and the
	 * backdrop call `onclose`.
	 */
	interface Props {
		repo: Repository
		/** The day the cutoff counts back from. */
		today: PlainDate
		/** The purchases are gone and the sheet has slid away; the page takes it off screen. */
		onpurged: (detail: PurgedDetail) => void
		/** The reader closed it; the page takes it off screen. */
		onclose: () => void
	}

	const { repo, today, onpurged, onclose }: Props = $props()

	type Preview = Awaited<ReturnType<typeof previewPurge>>

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let sheet: { leave: (then: () => void) => void } | undefined = $state()
	let age = $state<PurgeAge>("1y")
	/** What the chosen age would remove; null while it is being counted. */
	let preview = $state.raw<Preview | null>(null)
	let asking = $state(false)
	/** Why the write failed, kept raw so a language switch re-translates it. */
	let failure = $state.raw<unknown>(null)
	/** A count or write is under way, or the sheet is leaving: buttons wait and it holds open. */
	let busy = $state(false)

	const count = $derived(preview?.plan.purchaseIds.length ?? 0)
	const stay = $derived(preview ? preview.older - count : 0)

	const failureText = $derived.by(() => {
		void lang
		return failure === null ? "" : messageOf(failure, "purge.error")
	})

	const noteText = $derived.by(() => {
		void lang
		if (!preview) return ""
		if (count === 0) return t("purge.none", { age: t(`purge.span.${age}`) })
		return t(count === 1 ? "purge.note.one" : "purge.note.many", {
			count,
			date: displayDate(preview.cutoff, getLocale()),
		})
	})

	const askText = $derived.by(() => {
		void lang
		if (preview === null) return t("purge.counting")
		if (count === 0) return t("purge.nothing")
		return t(count === 1 ? "purge.ask.one" : "purge.ask.many", { count })
	})

	/** Counts what the current age would remove; an answer for an age since left is dropped. */
	const recount = async () => {
		const counting = age
		preview = null
		try {
			const next = await previewPurge(repo, counting, today)
			if (counting === age) preview = next
		} catch (caught) {
			if (counting === age) failure = caught
		}
	}

	const choose = (next: PurgeAge) => {
		if (busy || next === age) return
		age = next
		asking = false
		failure = null
		void recount()
	}

	const apply = async (plan: Preview) => {
		if (busy) return
		busy = true
		failure = null
		try {
			await applyPurge(repo, plan.plan)
		} catch (caught) {
			// Some purchases may have gone before the failure: count again, so a retry offers what
			// is there now, and only then let the buttons go.
			asking = false
			await recount()
			failure = caught
			busy = false
			return
		}
		// Busy stays on: the sheet is going, and a second apply must not start meanwhile.
		const detail: PurgedDetail = { count: plan.plan.purchaseIds.length, age }
		const emit = () => onpurged(detail)
		if (sheet) sheet.leave(emit)
		else emit()
	}

	onMount(() => {
		void recount()
		return subscribe(() => {
			lang = getLocale()
		})
	})
</script>

<Sheet bind:this={sheet} heading={tr("settings.reset.purge")} held={busy} {onclose}>
	<div class="body">
		<fieldset>
			<legend>{tr("purge.older")}</legend>
			<div class="choices">
				{#each PURGE_AGES as choice (choice)}
					<button
						type="button"
						data-variant="quiet"
						data-age={choice}
						aria-pressed={age === choice ? "true" : "false"}
						onclick={() => choose(choice)}>
						{tr(`purge.age.${choice}`)}
					</button>
				{/each}
			</div>
		</fieldset>
		{#if preview}
			<p class="note" data-tone={count > 0 ? "warn" : undefined}>{noteText}</p>
			{#if stay > 0}
				<p class="muted" data-note="stay">
					{tr(stay === 1 ? "purge.stay.one" : "purge.stay.many", { count: stay })}
				</p>
			{/if}
		{/if}
		<p class="muted">{tr("purge.explain")}</p>
		{#if failure !== null}
			<p role="alert" class="note" data-tone="bad">{failureText}</p>
		{/if}
		{#if asking && count > 0 && preview}
			{@const plan = preview}
			<p class="note" data-tone="bad">{tr("purge.sure")}</p>
			<div class="pair">
				<button
					type="button"
					data-action="keep"
					disabled={busy}
					onclick={() => {
						asking = false
					}}>
					{tr("purge.keep")}
				</button>
				<button type="button" data-variant="danger" data-action="yes" disabled={busy} onclick={() => apply(plan)}>
					{tr(count === 1 ? "purge.yes.one" : "purge.yes.many", { count })}
				</button>
			</div>
		{:else}
			<button
				type="button"
				data-variant="danger"
				data-action="ask"
				disabled={busy || count === 0}
				onclick={() => {
					asking = true
				}}>
				{askText}
			</button>
		{/if}
	</div>
</Sheet>

<style>
	.body {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
	}

	/* The age chips, as the filter sheets draw theirs (`filterSheet` in the legacy styles). */
	fieldset {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		min-inline-size: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	legend {
		padding: 0;
		margin-bottom: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		font-weight: 400;
		letter-spacing: normal;
		text-transform: none;
		color: var(--cc-text-muted);
	}

	.choices {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--cc-space-2);
	}

	.choices button[data-age] {
		padding: var(--cc-space-1) var(--cc-space-3);
		font-weight: 400;
		color: var(--cc-text);
		background: var(--cc-surface-sunken);
		border-color: transparent;
		border-radius: var(--cc-radius-pill);
	}

	.choices button[data-age]:hover {
		background: var(--cc-border);
	}

	.choices button[data-age][aria-pressed="true"] {
		font-weight: 600;
		color: var(--cc-success);
		background: var(--cc-accent-surface);
	}

	.note {
		margin: 0;
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.note[data-tone="warn"] {
		color: var(--cc-warning);
		background: var(--cc-warning-surface);
	}

	.note[data-tone="bad"] {
		color: var(--cc-danger);
		background: var(--cc-danger-surface);
	}

	.muted {
		margin: 0;
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.body > button {
		padding: var(--cc-space-3);
		font-size: var(--cc-text-md);
		font-weight: 650;
	}

	.pair {
		display: flex;
		flex-direction: row;
		gap: var(--cc-space-2);
	}

	.pair button {
		flex: 1 1 0;
		padding-block: var(--cc-space-3);
		font-size: var(--cc-text-md);
		font-weight: 650;
	}
</style>
