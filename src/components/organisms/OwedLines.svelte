<script lang="ts">
	import type { OwedEntry } from "#lib/domain/owed-plan"
	import type { LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { CycleInput } from "#lib/ui/cycle-line"

	import { onMount } from "svelte"

	import ActionRow from "#components/molecules/ActionRow.svelte"
	import { addDays, compareDates, dayMonth, daysBetween } from "#lib/domain/date"
	import { formatAmount } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, cardName, groupColor } from "#lib/ui/card-label"
	import { PAST_TODAY } from "#lib/ui/cycle-line"
	import { OpenRows } from "#lib/ui/open-row.svelte"
	import { entryNote } from "#lib/ui/owed-words"
	import { money, type Say, say } from "#lib/ui/row-text"

	/**
	 * The cards behind a day's money (or the late money) in the _Owed_ day panel, as the shared row
	 * that opens in place (`ActionRow`, one open at a time, as in Needs you and the ledger): the
	 * card's chip and line, what the amount is (a bill, a plan, an open statement, how late) and
	 * the amount (red when late, `~` and muted for an estimate). Opened, the statement's billing
	 * cycle line, one sentence, then _Pay_ for money that is firm and _Open card_.
	 */
	interface Props {
		entries: OwedEntry[]
		groups: LimitGroup[]
		today: PlainDate
		onpay: (entry: OwedEntry) => void
		onopencard: (cardId: string) => void
	}

	const { entries, groups, today, onpay, onopencard }: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let root = $state<HTMLElement | undefined>()
	const rows = new OpenRows("cc-owed-lines", () => root)

	/** Namespaced by kind and card, since a payment's id repeats across cards. */
	const rowId = (entry: OwedEntry) => `${entry.kind}:${entry.card.id}:${entry.payment?.id ?? entry.date}`

	$effect.pre(() => {
		rows.prune(entries.map(rowId))
	})

	const isLate = (entry: OwedEntry) => compareDates(entry.date, today) < 0

	/** The statement's line: from its start to its due date, or a few days past today once late. */
	const cycleOf = (entry: OwedEntry): CycleInput | undefined => {
		const s = entry.statement
		if (!s) return undefined
		const late = compareDates(s.due, today) < 0
		return {
			start: s.start,
			end: late ? addDays(today, PAST_TODAY) : s.due,
			marks: [
				{ kind: compareDates(s.close, today) < 0 ? "closed" : "closes", date: s.close },
				{ kind: "due", date: s.due },
				{ kind: "now", date: today },
			],
			fillTo: today,
			late,
		}
	}

	const words = (entry: OwedEntry) => {
		void lang
		const locale = getLocale()
		const amount = money(formatAmount(entry.amount))
		let sentence: Say
		if (isLate(entry)) {
			const days = daysBetween(entry.date, today)
			const when = days === 1 ? t("row.say.late.one") : t("row.say.late.many", { days })
			sentence = say("owed.plan.say.late", { amount, when })
		} else if (entry.kind === "open") {
			const s = entry.statement
			sentence = s
				? say("owed.plan.say.open", { amount, close: dayMonth(s.close, locale), due: dayMonth(s.due, locale) })
				: say("owed.plan.say.bill", { amount, date: dayMonth(entry.date, locale) })
		} else if (entry.kind === "plan") {
			sentence = entry.due
				? say("owed.plan.say.plan", { amount, date: dayMonth(entry.date, locale), due: dayMonth(entry.due, locale) })
				: say("owed.plan.say.planOnly", { amount, date: dayMonth(entry.date, locale) })
		} else {
			sentence = say("owed.plan.say.bill", { amount, date: dayMonth(entry.date, locale) })
		}
		return {
			subtitle: entryNote(entry, today),
			amount:
				entry.kind === "open"
					? { text: `~${formatAmount(entry.amount)}`, tone: "muted" as const }
					: { text: formatAmount(entry.amount), tone: isLate(entry) ? ("danger" as const) : ("plain" as const) },
			say: sentence,
		}
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="row-panel owed-lines" bind:this={root}>
	{#each entries as entry (rowId(entry))}
		{@const id = rowId(entry)}
		{@const w = words(entry)}
		<ActionRow
			kind={isLate(entry) ? "overdue" : "planned"}
			title={cardLine(entry.card.id, entry.card, { short: true })}
			subtitle={w.subtitle}
			{id}
			detailsId={rows.detailsId(id)}
			expanded={rows.isOpen(id)}
			ontoggle={() => rows.toggle(id)}
			amount={w.amount}
			cycle={cycleOf(entry)}
			say={w.say}>
			{#snippet lead()}
				<span class="mini" data-g={groupColor(entry.card, groups) ?? undefined}>{entry.card.last4}</span>
			{/snippet}
			{#snippet actions()}
				{#if entry.kind !== "open"}
					<button
						type="button"
						data-action="pay"
						aria-label={tr("owed.payName", {
							amount: formatAmount(entry.amount),
							card: cardName(entry.card.id, entry.card),
						})}
						onclick={() => onpay(entry)}>
						{tr("owed.pay")}
					</button>
				{/if}
				<button type="button" data-variant="quiet" data-action="open-card" onclick={() => onopencard(entry.card.id)}>
					{tr("row.openCard")}
				</button>
			{/snippet}
		</ActionRow>
	{/each}
</div>
