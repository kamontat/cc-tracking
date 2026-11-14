<script lang="ts">
	import type { OwedEntry } from "#lib/domain/owed-plan"
	import type { LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import { formatAmount } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, cardName, groupColor } from "#lib/ui/card-label"
	import { entryNote } from "#lib/ui/owed-words"

	/**
	 * The cards behind an amount on the _Owed_ tab (late money, a calendar day), as a row list:
	 * the card's chip and line, what the amount is (a bill, a plan, an open statement, how late),
	 * the amount, and _Pay_ for money that is firm. An open statement is an estimate (`~`, muted),
	 * so it has no _Pay_.
	 */
	interface Props {
		entries: OwedEntry[]
		groups: LimitGroup[]
		today: PlainDate
		onpay: (entry: OwedEntry) => void
	}

	const { entries, groups, today, onpay }: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const note = (entry: OwedEntry) => {
		void lang
		return entryNote(entry, today)
	}

	const keyOf = (entry: OwedEntry) => `${entry.kind}:${entry.card.id}:${entry.payment?.id ?? entry.date}`

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="row-panel owed-lines">
	{#each entries as entry (keyOf(entry))}
		{@const estimate = entry.kind === "open"}
		<div class="owed-line" data-card={entry.card.id} data-kind={entry.kind}>
			<span class="mini" data-g={groupColor(entry.card, groups) ?? undefined}>{entry.card.last4}</span>
			<span class="text">
				<b>{cardLine(entry.card.id, entry.card, { short: true })}</b>
				<small>{note(entry)}</small>
			</span>
			<span class="end">
				<b class="amount" data-numeric data-estimate={estimate ? "" : undefined}
					>{estimate ? "~" : ""}{formatAmount(entry.amount)}</b
				>
				{#if !estimate}
					<button
						type="button"
						data-action="pay"
						data-card={entry.card.id}
						aria-label={tr("owed.payName", {
							amount: formatAmount(entry.amount),
							card: cardName(entry.card.id, entry.card),
						})}
						onclick={() => onpay(entry)}>
						{tr("owed.pay")}
					</button>
				{/if}
			</span>
		</div>
	{/each}
</div>

<style>
	.owed-line {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: var(--cc-space-3);
		align-items: center;
		padding-block: var(--cc-space-2);
	}

	.text {
		display: flex;
		flex-direction: column;
		min-inline-size: 0;
	}

	.text b {
		overflow: hidden;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.text small {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	/* The amount, then Pay beside it, wrapping under it in a narrow column. */
	.end {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cc-space-1) var(--cc-space-3);
		align-items: center;
		justify-content: flex-end;
	}

	.amount {
		font-weight: 700;
		white-space: nowrap;
	}

	.amount[data-estimate] {
		font-weight: 500;
		color: var(--cc-text-muted);
	}

	/* Two classes, to outrank app.css's `.page button`: a compact primary button. */
	.owed-line button {
		padding-block: var(--cc-space-1);
		padding-inline: var(--cc-space-3);
		font-size: var(--cc-text-sm);
	}
</style>
