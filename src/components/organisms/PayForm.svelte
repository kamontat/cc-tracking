<script lang="ts">
	import type { Card, LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { PayDetail, PayFigures } from "#lib/ui/pay-form"

	import { onMount, untrack } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import { displayDate } from "#lib/domain/date"
	import { amountOf, formatAmount, formatAmountInput } from "#lib/domain/money"
	import { payPreview } from "#lib/domain/pay"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, cardName, groupColor } from "#lib/ui/card-label"
	import { figureParts, payDetail, readyAmount } from "#lib/ui/pay-form"

	/**
	 * The payment sheet's second step, for one card: the card with *Change*, its owed, next bill
	 * and credit, chips that fill the amount, the amount, the date and a note. A date after today
	 * plans the payment instead of recording it. Sending calls `onpay` with the amount and date
	 * (and the note when one was typed); *Change*, shown with `onchange`, calls it to go back to
	 * the card picker; *Cancel*, shown with `oncancel`, calls it (back to the card in its panel,
	 * RD-24). The page wraps it in its sheet or panel. Renders nothing without a card.
	 */
	interface Props {
		card: Card | null
		/** The stored limit groups, in order: the card's chip takes its group's colour. */
		groups?: LimitGroup[]
		figures?: PayFigures
		today: PlainDate
		/** The amount's first text; a new value replaces what was typed. */
		amount?: string
		/** The date's first value, for a sheet reopened on what was typed before; else today. */
		startDate?: PlainDate
		/** The note's first text, for a sheet reopened on what was typed before. */
		startNote?: string
		/** Why the last save failed, already in the reader's language; typing is kept. */
		error?: string
		/** A save is under way; the button waits so a second tap cannot record it twice. */
		busy?: boolean
		onpay: (detail: PayDetail) => void
		/** Shows *Change*, back to the card picker (`/pay`). */
		onchange?: (() => void) | undefined
		/** Shows *Cancel* beside the submit: back to the card in its panel. */
		oncancel?: (() => void) | undefined
	}

	const {
		card,
		groups = [],
		figures = { owed: 0, credit: 0, nextBill: 0, overdue: false },
		today,
		amount = "",
		startDate = "",
		startNote = "",
		error = "",
		busy = false,
		onpay,
		onchange,
		oncancel,
	}: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let text = $state(untrack(() => amount))
	let date = $state<PlainDate>(untrack(() => startDate || today))
	let note = $state(untrack(() => startNote))

	// Each prop refills its own field only when its value changes, as Lit's `changedProperties`
	// did: the page hands a fresh copy of the same values after every reload (a failed save's
	// included), and that must keep what was typed.
	let seenAmount = untrack(() => amount)
	let seenDate = untrack(() => startDate)
	let seenNote = untrack(() => startNote)
	$effect.pre(() => {
		const next = amount
		if (next === seenAmount) return
		seenAmount = next
		untrack(() => {
			text = next
		})
	})
	$effect.pre(() => {
		const next = startDate
		if (next === seenDate) return
		seenDate = next
		if (next)
			untrack(() => {
				date = next
			})
	})
	$effect.pre(() => {
		const next = startNote
		if (next === seenNote) return
		seenNote = next
		untrack(() => {
			note = next
		})
	})
	$effect.pre(() => {
		const next = today
		untrack(() => {
			if (date === "") date = next
		})
	})

	const ready = $derived(readyAmount(text, date))
	const preview = $derived(ready !== null ? payPreview(ready, date, figures.owed, today) : null)
	const color = $derived(card ? groupColor(card, groups) : null)
	const typed = $derived(amountOf(text))

	const submitLabel = $derived.by(() => {
		if (!card || ready === null || !preview) return tr("pay.submit.empty")
		const params = { amount: formatAmount(ready), card: cardName(card.id, card) }
		return preview.plan
			? tr("pay.submit.plan", { ...params, date: displayDate(date, getLocale()) })
			: tr("pay.submit.record", params)
	})

	const onSubmit = (event: Event) => {
		event.preventDefault()
		if (busy || ready === null) return
		onpay(payDetail(ready, date, note))
	}

	const fill = (satang: number) => {
		text = formatAmountInput(satang)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<!-- An amount with a <wbr> after its sign and each comma; on one line, as whitespace would show. -->
<!-- biome-ignore format: whitespace between the parts would print as spaces in the figure -->
{#snippet figure(satang: number)}{#each figureParts(satang) as part, i}{#if i > 0}<wbr>{/if}{part}{/each}{/snippet}

{#snippet chip(kind: "bill" | "owed", satang: number, label: string)}
	<button
		type="button"
		data-variant="quiet"
		data-chip={kind}
		aria-pressed={typed === satang ? "true" : "false"}
		onclick={() => fill(satang)}>
		{label}
	</button>
{/snippet}

{#if card}
	<div class="pay-form">
		<ErrorBanner message={error} />
		<div class="paycard">
			<span class="mini" data-g={color ?? undefined} data-big="">{card.last4}</span>
			<span class="what"
				><b><span class="card-label">{cardLine(card.id, card, { short: true })}</span></b></span
			>
			{#if onchange}
				<button type="button" data-variant="quiet" data-action="change" onclick={() => onchange()}>
					{tr("pay.change")}
				</button>
			{/if}
		</div>
		<div class="stats">
			<div class="stat" data-stat="owed">
				<small>{tr("pay.owed")}</small>
				<b data-numeric>{@render figure(figures.owed)}</b>
			</div>
			<div class="stat" data-stat="bill">
				<small>{tr("pay.nextBill")}</small>
				<b data-numeric data-overdue={figures.overdue && figures.nextBill > 0 ? "" : undefined}
					>{#if figures.nextBill > 0}
						{@render figure(figures.nextBill)}
					{:else}
						{tr("common.none")}
					{/if}</b
				>
			</div>
			<div class="stat" data-stat="credit">
				<small>{tr("pay.credit")}</small>
				<b data-numeric>{@render figure(figures.credit)}</b>
			</div>
		</div>
		<form onsubmit={onSubmit}>
			{#if figures.nextBill > 0 || figures.owed > 0}
				<div class="chips">
					{#if figures.nextBill > 0}
						{@render chip(
							"bill",
							figures.nextBill,
							tr(figures.overdue ? "pay.chip.overdue" : "pay.chip.bill", {
								amount: formatAmount(figures.nextBill),
							}),
						)}
					{/if}
					{#if figures.owed > 0 && figures.owed !== figures.nextBill}
						{@render chip("owed", figures.owed, tr("pay.chip.owed", { amount: formatAmount(figures.owed) }))}
					{/if}
				</div>
			{/if}
			<div class="fields">
				<label>
					{tr("pay.amount")}
					<input name="amount" inputmode="decimal" placeholder={tr("quickAdd.amountPlaceholder")} bind:value={text}>
				</label>
				<label>
					{tr("pay.date")}
					<input name="date" type="date" bind:value={date}>
				</label>
				<label class="wide">
					{tr("pay.noteLabel")}
					<input name="note" placeholder={tr("pay.notePlaceholder")} bind:value={note}>
				</label>
			</div>
			{#if preview && preview.extra > 0}
				<p class="note" data-note="extra">
					{tr("pay.note.extra", { extra: formatAmount(preview.extra), card: cardName(card.id, card) })}
				</p>
			{/if}
			{#if preview?.plan}
				<p class="note" data-note="plan">{tr("pay.note.plan", { date: displayDate(date, getLocale()) })}</p>
			{/if}
			{#if oncancel}
				<div class="pay-actions">
					<button type="button" data-variant="quiet" data-action="cancel" onclick={() => oncancel()}>
						{tr("common.cancel")}
					</button>
					<button type="submit" disabled={ready === null || busy}>{submitLabel}</button>
				</div>
			{:else}
				<button type="submit" disabled={ready === null || busy}>{submitLabel}</button>
			{/if}
			<p class="hint">{tr("pay.dateHint")}</p>
		</form>
	</div>
{/if}

<style>
	.pay-form {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
	}

	.pay-form form {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
	}

	.pay-form p {
		margin: 0;
	}

	/* Buttons, outranking app.css's `.page button` rules. */
	.pay-form button {
		align-self: flex-start;
		padding: var(--cc-space-2) var(--cc-space-3);
		font: inherit;
		font-size: var(--cc-text-sm);
		font-weight: 550;
		line-height: 1.2;
		white-space: nowrap;
		cursor: pointer;
		border: var(--cc-border-width) solid transparent;
		border-radius: var(--cc-radius-sm);
	}

	.pay-form button[data-variant="quiet"] {
		color: var(--cc-text);
		background: var(--cc-surface-sunken);
		border-color: var(--cc-border);
	}

	.pay-form button[data-variant="quiet"]:hover {
		background: var(--cc-border);
	}

	.pay-form button:disabled {
		cursor: default;
		opacity: 0.55;
	}

	/* The chip and label themselves are app.css's `.mini` and `.card-label`. */
	.paycard {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--cc-space-3);
		padding: var(--cc-space-3);
		line-height: 1.35;
		background: var(--cc-surface);
		border: var(--cc-ring-width) solid var(--cc-accent);
		border-radius: var(--cc-radius-md);
	}

	.paycard .what {
		display: flex;
		flex-direction: column;
		min-inline-size: 0;
	}

	.what b {
		font-size: var(--cc-text-md);
	}

	.pay-form .paycard button {
		align-self: center;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--cc-space-2);
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: calc(var(--cc-space-1) * 0.75);
		padding: var(--cc-space-2) var(--cc-space-3);
		line-height: 1.3;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-sm);
	}

	.stat small {
		font-size: var(--cc-text-xs);
		font-weight: 600;
		color: var(--cc-text-muted);
		text-transform: uppercase;
		letter-spacing: var(--cc-tracking-caps);
	}

	/* A figure breaks only after the baht sign or a comma (figureParts), never inside a group
	   of digits; on a phone it also steps down a size, so it mostly keeps one line. */
	.stat b {
		font-size: var(--cc-text-md);
		overflow-wrap: normal;
	}

	@media (max-width: 639px) {
		.stat {
			padding-inline: var(--cc-space-2);
		}

		.stat b {
			font-size: var(--cc-text-sm);
		}
	}

	.stat b[data-overdue] {
		color: var(--cc-danger);
	}

	.chips {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: var(--cc-space-2);
	}

	.pay-form .chips button[data-chip] {
		padding: var(--cc-space-1) var(--cc-space-3);
		font-weight: 400;
		color: var(--cc-text);
		background: var(--cc-surface-sunken);
		border-color: transparent;
		border-radius: var(--cc-radius-pill);
	}

	.pay-form .chips button[data-chip]:hover {
		background: var(--cc-border);
	}

	.pay-form .chips button[data-chip][aria-pressed="true"] {
		font-weight: 600;
		color: var(--cc-success);
		background: var(--cc-accent-surface);
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
		width: 100%;
		min-inline-size: 0;
		padding: var(--cc-space-3);
		font: inherit;
		font-size: var(--cc-text-md);
		color: var(--cc-text);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-sm);
	}

	.note {
		padding: var(--cc-space-2) var(--cc-space-3);
		font-size: var(--cc-text-sm);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.note[data-note="extra"] {
		background: var(--cc-accent-surface);
	}

	.pay-form button[type="submit"] {
		align-self: stretch;
		padding: var(--cc-space-3) var(--cc-space-4);
		font-size: var(--cc-text-md);
		font-weight: 650;
		white-space: normal;
		color: var(--cc-accent-text);
		background: var(--cc-accent);
		border-radius: var(--cc-radius-sm);
	}

	.pay-form button[type="submit"]:hover:not(:disabled) {
		background: var(--cc-accent-hover);
	}

	/* In the card panel: *Cancel* beside the submit, which keeps the room it needs to say what. */
	.pay-actions {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		gap: var(--cc-space-3);
	}

	.pay-form .pay-actions button[data-action="cancel"] {
		align-self: stretch;
		padding: var(--cc-space-3) var(--cc-space-4);
		font-size: var(--cc-text-md);
	}

	.pay-actions button[type="submit"] {
		flex: 1;
	}

	.hint {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
		text-align: center;
	}
</style>
