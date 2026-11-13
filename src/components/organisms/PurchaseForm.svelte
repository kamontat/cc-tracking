<script lang="ts">
	import type { Card, LimitGroup, PlainDate, Purchase } from "#lib/domain/types"
	import type { MessageKey } from "#lib/i18n/index"

	import { onMount, untrack } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import { isCloseDate } from "#lib/domain/cycle"
	import { compareDates, isValidDate } from "#lib/domain/date"
	import { amountOf, formatAmountInput } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, groupColor } from "#lib/ui/card-label"

	/**
	 * A purchase's form, the card fixed and named (FR-21), then its date, amount and note, in place
	 * of the card in its panel (RD-24). Given a
	 * saved `purchase` it edits it, with *Save changes*, keeping its id, card and `addedAt`. With
	 * none it adds one, with *Save purchase*: dated today, blank otherwise, its id made once when
	 * the form opens -- so a failed save retried writes the same record -- and stamped `addedAt`
	 * now (DR-15). A date ahead of today or on the close day is warned about, not refused (FR-20).
	 * *Save* calls `onsave` with the purchase at once; with `oncancel`, a quiet *Cancel* beside it
	 * calls that. `error` says why a save failed; what was typed stays (UI-11).
	 */
	interface Props {
		/** The card the purchase is on; it is shown, never picked. */
		card: Card | null
		/** Every stored group, for the card chip's pastel. */
		groups: LimitGroup[]
		/** The purchase to edit; null adds a new one. */
		purchase: Purchase | null
		/** The clock a new purchase's `addedAt` is read from. */
		now?: () => Date
		today: PlainDate
		/** Why the last save failed, already in the reader's language; typing is kept. */
		error: string
		/** A save is under way: the button waits. */
		busy: boolean
		onsave: (purchase: Purchase) => void
		/** Shows *Cancel*, which runs it: back to the card in its panel. */
		oncancel?: (() => void) | undefined
	}

	const { card, groups, purchase, now = () => new Date(), today, error, busy, onsave, oncancel }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey) => {
		void lang
		return t(key)
	}

	let date = $state<PlainDate>("")
	let amount = $state("")
	let note = $state("")
	/** The catalog key, so a language switch re-renders the message in place. */
	let errorKey = $state<MessageKey | "">("")
	/** The purchase id (or `new:<card>`) the fields were last filled from; unset before the first fill. */
	let filledFor: string | undefined
	/** A new purchase's id, made when the add sheet opens on a card. */
	let newId = ""

	/**
	 * Fills the fields only when the sheet turns to another purchase (by id), or, adding, to
	 * another card, so a fresh copy of the same one -- a reload after a failed save -- keeps what
	 * was typed.
	 */
	const fill = (next: Purchase | null, on: Card | null) => {
		if (!next) {
			const key = on ? `new:${on.id}` : undefined
			if (!key || key === filledFor) return
			filledFor = key
			newId = crypto.randomUUID()
			date = today
			amount = ""
			note = ""
			errorKey = ""
			return
		}
		if (next.id === filledFor) return
		filledFor = next.id
		date = next.date
		amount = formatAmountInput(next.amount)
		note = next.note
		errorKey = ""
	}

	untrack(() => fill(purchase, card))
	$effect.pre(() => {
		const next = purchase
		const on = card
		untrack(() => fill(next, on))
	})

	const inFuture = $derived(isValidDate(date) && compareDates(date, today) > 0)
	const onCloseDate = $derived(card !== null && isValidDate(date) && isCloseDate(card.cycle, date))
	const color = $derived(card ? groupColor(card, groups) : null)

	const onSubmit = (event: SubmitEvent | Event) => {
		event.preventDefault()
		if (busy) return
		if (!purchase && !card) return
		const day = date.trim()
		if (!isValidDate(day)) {
			errorKey = "quickAdd.error.badDate"
			return
		}
		const satang = amountOf(amount.trim())
		if (satang === null) {
			errorKey = "quickAdd.error.badAmount"
			return
		}
		errorKey = ""
		const text = note.trim()
		const detail: Purchase = purchase
			? {
					id: purchase.id,
					cardId: purchase.cardId,
					date: day,
					amount: satang,
					note: text,
					...(purchase.addedAt ? { addedAt: purchase.addedAt } : {}),
				}
			: {
					id: newId,
					cardId: card?.id ?? "",
					date: day,
					amount: satang,
					note: text,
					addedAt: now().toISOString(),
				}
		onsave(detail)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="purchase-form">
	<ErrorBanner message={error} />
	<form onsubmit={onSubmit} novalidate>
		{#if errorKey}
			<p role="alert">{tr(errorKey)}</p>
		{/if}
		{#if card}
			<div class="fixed" data-field="card">
				<span class="fixed__label">{tr("quickAdd.card")}</span>
				<span class="card-panel">
					<span class="mini" data-g={color ?? undefined}>{card.last4}</span>
					<span class="card-label">{cardLine(card.id, card, { short: true })}</span>
				</span>
			</div>
		{/if}
		<div class="fields">
			<label>
				{tr("quickAdd.date")}
				<input name="date" type="date" autocomplete="off" bind:value={date}>
			</label>
			<label>
				{tr("quickAdd.amount")}
				<input
					name="amount"
					type="text"
					inputmode="decimal"
					placeholder={tr("quickAdd.amountPlaceholder")}
					autocomplete="off"
					bind:value={amount}>
			</label>
			<label class="wide">
				{tr("quickAdd.note")}
				<input
					name="note"
					type="text"
					placeholder={tr("quickAdd.notePlaceholder")}
					autocomplete="off"
					bind:value={note}>
			</label>
		</div>
		{#if inFuture}
			<p class="warning" data-testid="future-date-warning">{tr("quickAdd.futureDateWarning")}</p>
		{/if}
		{#if onCloseDate}
			<p class="warning" data-testid="close-date-warning">{tr("quickAdd.closeDateWarning")}</p>
		{/if}
		<div class="actions">
			{#if oncancel}
				<button type="button" data-variant="quiet" data-action="cancel" onclick={oncancel}>
					{tr("common.cancel")}
				</button>
			{/if}
			<button type="submit" disabled={busy}>{tr(purchase === null ? "card.purchase.saveNew" : "quickAdd.save")}</button>
		</div>
	</form>
</div>

<style>
	.purchase-form {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
	}

	.fixed {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
	}

	.fixed__label {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	/* The chip and label themselves are app.css's `.card-panel` and `.mini`. */
	.fixed .card-panel {
		padding: var(--cc-space-3);
		font-weight: 600;
		color: var(--cc-text);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-sm);
	}

	.fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--cc-space-3);
	}

	.fields label {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.fields .wide {
		grid-column: 1 / -1;
	}

	.fields input {
		min-inline-size: 0;
		padding: var(--cc-space-3);
		font: inherit;
		font-size: var(--cc-text-md);
		color: var(--cc-text);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-sm);
	}

	form p[role="alert"] {
		margin: 0;
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		color: var(--cc-danger);
		background: var(--cc-danger-surface);
		border-radius: var(--cc-radius-sm);
	}

	/* A caution, not a refusal. */
	.warning {
		margin: 0;
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		color: var(--cc-warning);
		background: var(--cc-warning-surface);
		border-radius: var(--cc-radius-sm);
	}

	.actions {
		display: flex;
		flex-direction: row;
		gap: var(--cc-space-3);
	}

	.actions button {
		flex: 1;
	}

	form button[type="submit"],
	form button[data-action="cancel"] {
		padding: var(--cc-space-3) var(--cc-space-4);
		font-size: var(--cc-text-md);
		font-weight: 650;
		border-radius: var(--cc-radius-sm);
	}
</style>
