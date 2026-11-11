<script lang="ts">
	import type { GroupColor } from "#lib/domain/group-color"
	import type { CardUsage, UsageStatement } from "#lib/domain/usage"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import { dayMonth, displayDate, parseDate, shortMonth } from "#lib/domain/date"
	import { formatAmount, formatCompact } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"

	/**
	 * A card's use over its last 12 statements, in the new-list sheet (DD-195). First the figures:
	 * the room now (when given), what the 12 statements add up to, the average of the closed ones
	 * and the day it was last used. Then a bar per statement, oldest first and on the card's own
	 * scale, its amount over it (short: `12.5K`) and its month under it, the year under the first
	 * and under each January; the open statement is faint, and the average is a dashed line.
	 * Each bar is named in words, so the chart reads without the picture.
	 */
	interface Props {
		usage: CardUsage
		/** The group's room now, in satang; left out, the figure is too. */
		room?: number | undefined
		/** The card's group colour, for the bars. */
		tone?: GroupColor | undefined
	}

	const { usage, room, tone }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const top = $derived(Math.max(0, ...usage.statements.map((s) => s.total)))
	const share = (amount: number) => `${(amount / top) * 100}%`

	/** A bar's month, and its year (two digits) under the first bar and each January. */
	const month = (s: UsageStatement, index: number) => {
		void lang
		const { year, month: m } = parseDate(s.closeDate)
		return { name: shortMonth(s.closeDate, lang), year: index === 0 || m === 1 ? String(year).slice(2) : null }
	}

	const named = (s: UsageStatement) => {
		void lang
		const params = { date: dayMonth(s.closeDate, lang), amount: formatAmount(s.total) }
		return tr(s.open ? "usage.bar.open" : "usage.bar", params)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="usage" data-g={tone}>
	<div class="stats">
		{#if room !== undefined}
			<div><small>{tr("usage.room")}</small> <b data-numeric>{formatAmount(room)}</b></div>
		{/if}
		<div><small>{tr("usage.total")}</small> <b data-numeric>{formatAmount(usage.total)}</b></div>
		<div><small>{tr("usage.average")}</small> <b data-numeric>{formatAmount(usage.average)}</b></div>
		<div>
			<small>{tr("usage.lastUsed")}</small>
			<b>{usage.lastUsed ? displayDate(usage.lastUsed, lang) : tr("usage.never")}</b>
		</div>
	</div>
	<ol class="chart" aria-label={tr("usage.title")}>
		{#each usage.statements as statement, index (statement.period)}
			{@const zero = statement.total <= 0}
			{@const label = month(statement, index)}
			<li aria-label={named(statement)} data-open={statement.open ? "" : undefined}>
				<span class="v" aria-hidden="true">{zero ? "–" : formatCompact(statement.total)}</span>
				<span class="slot" aria-hidden="true">
					<i data-zero={zero ? "" : undefined} style:block-size={zero ? undefined : share(statement.total)}></i>
					{#if usage.average > 0 && top > 0}
						<b class="avg" style:inset-block-end={share(usage.average)}></b>
					{/if}
				</span>
				<span class="m" aria-hidden="true"
					>{label.name}
					{#if label.year}
						<small>{label.year}</small>
					{/if}</span
				>
			</li>
		{/each}
	</ol>
</div>

<style>
	.usage {
		display: grid;
		gap: var(--cc-space-3);
	}

	/* Two figures a row, each a quiet box: the sheet stays narrow even on a desktop. */
	.stats {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--cc-space-2);
	}

	.stats > div {
		display: flex;
		flex-direction: column;
		gap: 0;
		padding: var(--cc-space-2) var(--cc-space-3);
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.stats small {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.stats b {
		font-size: var(--cc-text-md);
		font-variant-numeric: tabular-nums;
	}

	.chart {
		display: grid;
		grid-auto-columns: minmax(0, 1fr);
		grid-auto-flow: column;
		gap: var(--cc-space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--cc-space-1);
		min-inline-size: 0;
	}

	.v,
	.m {
		font-size: var(--cc-text-2xs);
		line-height: 1.2;
		color: var(--cc-text-muted);
		text-align: center;
		white-space: nowrap;
	}

	/* The year sits under its month, so a phone's narrow bars keep their labels apart. */
	.m small {
		display: block;
		font-size: inherit;
	}

	.v {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	/* The bar's box, one height for every bar, the bar sitting on its floor. */
	.slot {
		position: relative;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		inline-size: 100%;
		block-size: var(--cc-chart-height);
	}

	i {
		display: block;
		inline-size: 100%;
		max-inline-size: var(--cc-space-5);
		background: var(--g-fg, var(--cc-text-muted));
		border-radius: var(--cc-radius-xs) var(--cc-radius-xs) 0 0;
	}

	i[data-zero] {
		block-size: var(--cc-border-width);
		background: color-mix(in oklab, var(--cc-text) 18%, transparent);
		border-radius: 0;
	}

	li[data-open] i {
		opacity: var(--cc-usage-open-opacity);
	}

	/* The average: one dashed rule across the chart, drawn a piece in each bar's box. */
	.avg {
		position: absolute;
		inset-inline: calc(var(--cc-space-1) / -2);
		border-top: var(--cc-border-width) dashed var(--cc-text-muted);
		pointer-events: none;
	}

	@media (forced-colors: active) {
		i {
			background: CanvasText;
		}
	}
</style>
