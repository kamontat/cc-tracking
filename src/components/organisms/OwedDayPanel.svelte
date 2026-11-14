<script lang="ts">
	import type { OwedDay, OwedEntry } from "#lib/domain/owed-plan"
	import type { LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { RecordPanel } from "#lib/ui/record-panel.svelte"

	import { onMount } from "svelte"

	import DetailPanel from "#components/molecules/DetailPanel.svelte"
	import OwedLines from "#components/organisms/OwedLines.svelte"
	import { displayDate } from "#lib/domain/date"
	import { formatAmount, sumAmounts } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { LATE_DAY } from "#lib/ui/record-panel.svelte"
	import { whenWords } from "#lib/ui/row-text"

	/**
	 * The _Owed_ tab's day panel (`?day=<date>`, or `?day=late`), beside the calendar or the list from
	 * 900px and over it below, as a list opens on the Lists tab: the day's date and how far off, its
	 * firm total (or the open statements' estimate), what is needed in all by then, and its cards
	 * with _Pay_. The late money is the same panel under *Late*. A day the plan no longer holds (a
	 * filter took it out) says there is nothing to pay. _Pay_ opens the card's pay form a step
	 * deeper (`panel.deeper`), so Back returns here.
	 */
	interface Props {
		panel: RecordPanel
		days: OwedDay[]
		late: OwedEntry[]
		groups: LimitGroup[]
		today: PlainDate
	}

	const { panel, days, late, groups, today }: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const id = $derived(panel.view?.kind === "day" && !panel.view.form ? panel.view.id : null)
	const isLate = $derived(id === LATE_DAY)
	const day = $derived(id && !isLate ? (days.find((d) => d.date === id) ?? null) : null)
	const entries = $derived(isLate ? late : (day?.entries ?? []))
	const lateTotal = $derived(sumAmounts(late.map((e) => e.amount)))

	const head = $derived.by(() => {
		void lang
		if (isLate) return { title: t("owed.plan.lateTitle"), detail: t("owed.plan.lateDetail") }
		if (!id) return { title: "", detail: "" }
		return { title: displayDate(id, getLocale()), detail: whenWords(id, today) }
	})

	/** _Pay_: the card's pay form with the amount filled in, a step deeper. */
	const pay = (entry: OwedEntry) =>
		panel.deeper({ kind: "card", id: entry.card.id }, { name: "pay", arg: `${entry.amount}` })

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#if id}
	<DetailPanel title={head.title} detail={head.detail} onclose={() => panel.close()}>
		<div class="owed-day">
			{#if isLate}
				<p class="total"><span>{tr("owed.plan.toPay")}</span><b data-numeric>{formatAmount(lateTotal)}</b></p>
			{:else if day}
				<p class="total">
					<span>{tr("owed.plan.toPay")}</span>
					<b data-numeric
						>{day.firm > 0 ? formatAmount(day.firm) : tr("owed.plan.soFar", { amount: formatAmount(day.estimate) })}</b
					>
				</p>
				{#if day.firm > 0}
					<p class="by-then">
						<span>{tr("owed.plan.byThen")}</span>
						<b data-numeric data-by-then>{formatAmount(day.byThen)}</b>
					</p>
				{/if}
			{/if}
			{#if entries.length > 0}
				<OwedLines {entries} {groups} {today} onpay={pay} />
			{:else}
				<p class="none">{tr("owed.plan.nothingThatDay")}</p>
			{/if}
		</div>
	</DetailPanel>
{/if}

<style>
	.owed-day {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
	}

	.total,
	.by-then {
		display: flex;
		gap: var(--cc-space-2);
		align-items: baseline;
		justify-content: space-between;
		margin: 0;
		color: var(--cc-text-muted);
	}

	.total b {
		font-size: var(--cc-text-2xl);
		font-weight: 800;
		color: var(--cc-text);
	}

	.by-then {
		font-size: var(--cc-text-sm);
	}

	.by-then b {
		color: var(--cc-text);
	}

	.none {
		margin: 0;
		color: var(--cc-text-muted);
	}
</style>
