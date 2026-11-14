<script lang="ts">
	import type { OwedCell, OwedWeek } from "#lib/domain/owed-plan"
	import type { LimitGroup, Period, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import { displayDate, monthName, parseDate } from "#lib/domain/date"
	import { formatAmount, formatCompact, sumAmounts } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { groupColor } from "#lib/ui/card-label"

	/**
	 * The _Owed_ tab's calendar: one month (`month`), ‹ and › to the one before and after among
	 * `months`, its firm total under its name. Monday to Sunday, then each week's firm total. A
	 * paying day is a button with its total (compact), shaded darker the more it is, and a dot per
	 * card in its group's colour; a day holding only an open statement is dashed with `~`. Today
	 * is ringed, in red with the late money while any is late. Picking a day calls `onpick`.
	 */
	interface Props {
		weeks: OwedWeek[]
		month: Period
		months: Period[]
		selected: PlainDate | null
		today: PlainDate
		/** Late money, shown on today. */
		late: number
		groups: LimitGroup[]
		onmonth: (month: Period) => void
		onpick: (date: PlainDate) => void
	}

	const { weeks, month, months, selected, today, late, groups, onmonth, onpick }: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	/** Monday first, as the weeks run. */
	const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const

	const index = $derived(months.indexOf(month))
	const before = $derived(index > 0 ? months[index - 1] : undefined)
	const after = $derived(index >= 0 && index < months.length - 1 ? months[index + 1] : undefined)
	const first = $derived(`${month}-01`)
	const heading = $derived.by(() => {
		void lang
		return `${monthName(first, getLocale())} ${parseDate(first).year}`
	})
	const monthTotal = $derived(sumAmounts(weeks.map((w) => w.firm)))
	const biggest = $derived(Math.max(1, ...weeks.flatMap((w) => w.days.map((c) => c.plan?.firm ?? 0))))

	/** 15% to 60% of the accent: a day's share of the biggest day this month. */
	const heat = (cell: OwedCell) => Math.round(15 + ((cell.plan?.firm ?? 0) / biggest) * 45)

	const label = (cell: OwedCell) => {
		void lang
		const plan = cell.plan
		const date = displayDate(cell.date, getLocale())
		if (!plan) return date
		return `${date}, ${plan.firm > 0 ? formatAmount(plan.firm) : tr("owed.plan.soFar", { amount: formatAmount(plan.estimate) })}`
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<section class="panel owed-cal" aria-labelledby="owed-cal-heading">
	<div class="head">
		<button
			type="button"
			class="nav"
			data-variant="quiet"
			data-action="month-before"
			aria-label={tr("owed.plan.monthBefore")}
			disabled={!before}
			onclick={() => before && onmonth(before)}>
			<SvgIcon name="chevron" />
		</button>
		<h3 id="owed-cal-heading">
			{heading}
			<small data-numeric>{tr("owed.plan.month", { amount: formatAmount(monthTotal) })}</small>
		</h3>
		<button
			type="button"
			class="nav next"
			data-variant="quiet"
			data-action="month-after"
			aria-label={tr("owed.plan.monthAfter")}
			disabled={!after}
			onclick={() => after && onmonth(after)}>
			<SvgIcon name="chevron" />
		</button>
	</div>
	<div class="grid">
		{#each WEEKDAYS as day (day)}
			<span class="dow">{tr(`date.weekday.${day}`)}</span>
		{/each}
		<span class="dow wk">{tr("owed.plan.weekTotal")}</span>
		{#each weeks as week (week.days[0]?.date)}
			{#each week.days as cell (cell.date)}
				{@const n = parseDate(cell.date).day}
				{@const isToday = cell.date === today}
				{#if cell.plan && cell.inMonth}
					{@const plan = cell.plan}
					<button
						type="button"
						class="cell"
						data-date={cell.date}
						data-estimate={plan.firm === 0 ? "" : undefined}
						data-today={isToday ? "" : undefined}
						data-past={cell.date < today ? "" : undefined}
						style:--heat="{heat(cell)}%"
						aria-pressed={selected === cell.date ? "true" : "false"}
						aria-label={label(cell)}
						onclick={() => onpick(cell.date)}>
						<span class="n">{n}</span>
						<span class="v" data-numeric
							>{plan.firm > 0 ? formatCompact(plan.firm) : `~${formatCompact(plan.estimate)}`}</span
						>
						<span class="dots" aria-hidden="true">
							{#each plan.entries.slice(0, 4) as entry, i (i)}
								<i data-g={groupColor(entry.card, groups) ?? undefined}></i>
							{/each}
						</span>
					</button>
				{:else}
					<span
						class="cell"
						data-date={cell.date}
						data-out={cell.inMonth ? undefined : ""}
						data-today={isToday ? "" : undefined}
						data-late={isToday && late > 0 ? "" : undefined}
						data-past={cell.date < today ? "" : undefined}>
						<span class="n">{n}</span>
						{#if isToday && late > 0}
							<span class="v" data-numeric>{formatCompact(late)}</span>
						{/if}
					</span>
				{/if}
			{/each}
			<span class="wk" data-week={week.days[0]?.date} data-numeric>
				{#if week.firm > 0}
					{formatCompact(week.firm)}
				{:else if week.estimate > 0}
					~{formatCompact(week.estimate)}
				{:else}
					{tr("common.none")}
				{/if}
			</span>
		{/each}
	</div>
	<p class="legend">
		<span><i class="sw"></i>{tr("owed.plan.legend.pay")}</span>
		<span><i class="sw" data-estimate></i>{tr("owed.plan.legend.open")}</span>
	</p>
</section>

<style>
	.owed-cal {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
		padding: var(--cc-panel-padding);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	/* The reset makes every div a column; the heading is a row. */
	.head {
		display: flex;
		flex-direction: row;
		gap: var(--cc-space-2);
		align-items: center;
	}

	.head h3 {
		display: flex;
		flex: 1;
		flex-direction: column;
		margin: 0;
		font-size: var(--cc-text-lg);
	}

	.head h3 small {
		font-size: var(--cc-text-xs);
		font-weight: 400;
		color: var(--cc-text-muted);
	}

	/* Two classes, to outrank app.css's `.page button`. The chevron points down; turned, it points
	   back and on. */
	.owed-cal .nav {
		justify-content: center;
		inline-size: var(--cc-control-size);
		block-size: var(--cc-control-size);
		padding: 0;
		transform: rotate(90deg);
	}

	.owed-cal .nav.next {
		transform: rotate(-90deg);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr)) minmax(0, 1.2fr);
		gap: var(--cc-space-1);
	}

	.dow {
		padding-block-end: var(--cc-space-1);
		font-size: var(--cc-text-2xs);
		font-weight: 700;
		color: var(--cc-text-muted);
		text-align: center;
		text-transform: uppercase;
		letter-spacing: var(--cc-tracking-caps);
	}

	.dow.wk,
	.wk {
		padding-inline-end: var(--cc-space-1);
		text-align: end;
	}

	.wk {
		display: grid;
		align-content: center;
		font-size: var(--cc-text-xs);
		font-weight: 700;
		border-inline-start: var(--cc-border-width) solid var(--cc-border);
	}

	/* Two classes on the button, to outrank app.css's `.page button`. */
	.grid .cell {
		display: grid;
		align-content: space-between;
		justify-items: start;
		gap: 0;
		min-block-size: var(--cc-cal-cell);
		min-inline-size: 0;
		padding: var(--cc-space-1);
		font-size: var(--cc-text-xs);
		font-weight: 400;
		color: var(--cc-text);
		text-align: start;
		background: transparent;
		border: var(--cc-border-width) solid transparent;
		border-radius: var(--cc-radius-xs);
	}

	.grid button.cell {
		cursor: pointer;
		background: color-mix(in oklab, var(--cc-accent) var(--heat), var(--cc-surface));
	}

	.grid button.cell:hover {
		border-color: var(--cc-accent);
	}

	.grid button.cell[data-estimate] {
		background: transparent;
		border: var(--cc-rule-width) dashed var(--cc-border);
	}

	.grid button.cell[aria-pressed="true"] {
		box-shadow: 0 0 0 var(--cc-ring-width) var(--cc-text);
	}

	.cell[data-out] {
		visibility: hidden;
	}

	.n {
		font-weight: 600;
		color: var(--cc-text-muted);
	}

	.cell[data-past] .n {
		opacity: 0.5;
	}

	.grid .cell[data-today] {
		border: var(--cc-ring-width) solid var(--cc-accent);
	}

	.grid .cell[data-late] {
		border-color: var(--cc-danger);
		color: var(--cc-danger);
	}

	.cell[data-today] .n,
	.cell[data-late] .n {
		color: inherit;
	}

	.v {
		overflow: hidden;
		max-inline-size: 100%;
		font-weight: 750;
		white-space: nowrap;
	}

	.cell[data-estimate] .v {
		font-weight: 500;
		color: var(--cc-text-muted);
	}

	.dots {
		display: flex;
		gap: calc(var(--cc-space-1) / 2);
	}

	.dots i {
		display: block;
		inline-size: var(--cc-space-2);
		block-size: var(--cc-space-2);
		background: var(--g-fg, var(--cc-text-muted));
		border-radius: var(--cc-radius-pill);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cc-space-1) var(--cc-space-4);
		margin: 0;
		font-size: var(--cc-text-2xs);
		color: var(--cc-text-muted);
	}

	.sw {
		display: inline-block;
		inline-size: var(--cc-space-3);
		block-size: var(--cc-space-3);
		margin-inline-end: var(--cc-space-1);
		vertical-align: middle;
		background: color-mix(in oklab, var(--cc-accent) 40%, var(--cc-surface));
		border-radius: var(--cc-radius-xs);
	}

	.sw[data-estimate] {
		background: transparent;
		border: var(--cc-border-width) dashed var(--cc-text-muted);
	}

	@media (min-width: 900px) {
		.grid {
			gap: var(--cc-space-2);
		}

		.grid .cell {
			padding: var(--cc-space-2);
			font-size: var(--cc-text-sm);
		}

		.v,
		.wk {
			font-size: var(--cc-text-sm);
		}
	}
</style>
