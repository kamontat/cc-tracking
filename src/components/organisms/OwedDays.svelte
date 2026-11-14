<script lang="ts">
	import type { OwedDay, OwedSection } from "#lib/domain/owed-plan"
	import type { PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import ActionRow from "#components/molecules/ActionRow.svelte"
	import { dayMonth, headerDate, parseDate } from "#lib/domain/date"
	import { formatAmount } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardName } from "#lib/ui/card-label"
	import { sectionName } from "#lib/ui/owed-words"
	import { whenWords } from "#lib/ui/row-text"

	/**
	 * The _Owed_ tab as a list: a heading per week or month with its firm total, then each day as a
	 * row that opens the day's panel (`ActionRow` with `onopen`, as a list on the Lists tab): the
	 * date, its cards and how far off, and its firm total (or `~` and the estimate when it only
	 * holds open statements). The open day's row is marked (`current`).
	 */
	interface Props {
		sections: OwedSection[]
		by: "week" | "month"
		today: PlainDate
		/** The day open in the panel. */
		current: PlainDate | null
		onopen: (date: PlainDate) => void
	}

	const { sections, by, today, current, onopen }: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const words = (day: OwedDay) => {
		void lang
		const names = [...new Set(day.entries.map((e) => cardName(e.card.id, e.card)))]
		return {
			title: headerDate(day.date, getLocale(), false),
			subtitle: `${names.join(", ")} · ${whenWords(day.date, today)}`,
			amount:
				day.firm > 0
					? { text: formatAmount(day.firm), tone: "plain" as const }
					: { text: `~${formatAmount(day.estimate)}`, tone: "muted" as const },
		}
	}

	const nameOf = (section: OwedSection) => {
		void lang
		return sectionName(section, by, today)
	}

	const span = (section: OwedSection) => {
		void lang
		const locale = getLocale()
		return tr("owed.plan.span", { from: dayMonth(section.start, locale), to: dayMonth(section.end, locale) })
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="owed-days">
	{#each sections as section (section.start)}
		<section>
			<h2 class="owed-head">
				<span class="name">{nameOf(section)}</span>
				{#if by === "week"}
					<span class="span">{span(section)}</span>
				{/if}
				<b data-numeric>{section.firm > 0 ? formatAmount(section.firm) : `~${formatAmount(section.estimate)}`}</b>
			</h2>
			<div class="row-panel panel">
				{#each section.days as day (day.date)}
					{@const w = words(day)}
					<ActionRow
						kind="planned"
						title={w.title}
						subtitle={w.subtitle}
						id={`day:${day.date}`}
						amount={w.amount}
						current={current === day.date}
						onopen={() => onopen(day.date)}>
						{#snippet lead()}
							<span class="date">
								<small>{tr(`date.weekday.${new Date(`${day.date}T00:00:00Z`).getUTCDay()}`)}</small>
								<b>{parseDate(day.date).day}</b>
							</span>
						{/snippet}
					</ActionRow>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.owed-days {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-5);
	}

	section {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-2);
	}

	.owed-head {
		display: flex;
		flex-wrap: wrap;
		gap: var(--cc-space-2);
		align-items: baseline;
		margin: 0;
		padding-inline: var(--cc-space-1);
		font-size: var(--cc-text-sm);
		font-weight: 700;
		color: var(--cc-text-muted);
		text-transform: uppercase;
		letter-spacing: var(--cc-tracking-label);
	}

	.owed-head .span {
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
	}

	.owed-head b {
		margin-inline-start: auto;
		font-size: var(--cc-text-md);
		color: var(--cc-text);
		letter-spacing: 0;
	}

	.date {
		display: grid;
		justify-items: center;
		inline-size: var(--cc-space-7);
		padding-block: var(--cc-space-1);
		line-height: 1.1;
		background: var(--cc-surface-sunken);
		border-radius: var(--cc-radius-sm);
	}

	.date small {
		font-size: var(--cc-text-2xs);
		font-weight: 700;
		color: var(--cc-text-muted);
		text-transform: uppercase;
	}

	.date b {
		font-size: var(--cc-text-lg);
		font-weight: 800;
	}
</style>
