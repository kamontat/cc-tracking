<script lang="ts">
	import type { OwedDay, OwedEntry, OwedSection } from "#lib/domain/owed-plan"
	import type { LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import ActionRow from "#components/molecules/ActionRow.svelte"
	import { dayMonth, headerDate, parseDate } from "#lib/domain/date"
	import { formatAmount } from "#lib/domain/money"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine, cardName } from "#lib/ui/card-label"
	import { OpenRows } from "#lib/ui/open-row.svelte"
	import { entryNote, sectionName } from "#lib/ui/owed-words"
	import { money, say, whenWords } from "#lib/ui/row-text"

	/**
	 * The _Owed_ tab as a list: a heading per week or month with its firm total, then each day as
	 * the row that opens in place (`ActionRow`, one open at a time): the date, its cards and how
	 * far off, its firm total (or `~` and the estimate when it only holds open statements). Opened,
	 * it shows each card's amount, a sentence with what is needed by then, and _Pay_ per card.
	 */
	interface Props {
		sections: OwedSection[]
		by: "week" | "month"
		today: PlainDate
		groups: LimitGroup[]
		onpay: (entry: OwedEntry) => void
	}

	const { sections, by, today, onpay }: Props = $props()

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let root = $state<HTMLElement | undefined>()
	const rows = new OpenRows("cc-owed-days", () => root)

	const rowId = (day: OwedDay) => `day:${day.date}`

	$effect.pre(() => {
		rows.prune(sections.flatMap((s) => s.days.map(rowId)))
	})

	const words = (day: OwedDay) => {
		void lang
		const locale = getLocale()
		const names = [...new Set(day.entries.map((e) => cardName(e.card.id, e.card)))]
		return {
			title: headerDate(day.date, locale, false),
			subtitle: `${names.join(", ")} · ${whenWords(day.date, today)}`,
			amount:
				day.firm > 0
					? { text: formatAmount(day.firm), tone: "plain" as const }
					: { text: `~${formatAmount(day.estimate)}`, tone: "muted" as const },
			parts: day.entries.map((e) => ({
				label: `${cardLine(e.card.id, e.card, { short: true })} · ${entryNote(e, today)}`,
				amount: `${e.kind === "open" ? "~" : ""}${formatAmount(e.amount)}`,
			})),
			say:
				day.firm > 0
					? say("owed.plan.say", {
							amount: money(formatAmount(day.firm)),
							date: dayMonth(day.date, locale),
							total: money(formatAmount(day.byThen)),
						})
					: say("owed.plan.sayOpen"),
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

<div class="owed-days" bind:this={root}>
	{#each sections as section (section.start)}
		<section>
			<h2 class="owed-head" tabindex="-1" data-refocus="owed-days">
				<span class="name">{nameOf(section)}</span>
				{#if by === "week"}
					<span class="span">{span(section)}</span>
				{/if}
				<b data-numeric>{section.firm > 0 ? formatAmount(section.firm) : `~${formatAmount(section.estimate)}`}</b>
			</h2>
			<div class="row-panel panel">
				{#each section.days as day (day.date)}
					{@const id = rowId(day)}
					{@const w = words(day)}
					<ActionRow
						kind="planned"
						title={w.title}
						subtitle={w.subtitle}
						{id}
						detailsId={rows.detailsId(id)}
						expanded={rows.isOpen(id)}
						ontoggle={() => rows.toggle(id)}
						amount={w.amount}
						parts={w.parts}
						say={w.say}>
						{#snippet lead()}
							<span class="date">
								<small>{tr(`date.weekday.${new Date(`${day.date}T00:00:00Z`).getUTCDay()}`)}</small>
								<b>{parseDate(day.date).day}</b>
							</span>
						{/snippet}
						{#snippet actions()}
							{#each day.entries.filter(
								(e) => e.kind !== "open",
							) as entry (`${entry.kind}:${entry.card.id}:${entry.payment?.id ?? ""}`)}
								<button
									type="button"
									data-action="pay"
									data-card={entry.card.id}
									aria-label={tr("owed.payName", {
										amount: formatAmount(entry.amount),
										card: cardName(entry.card.id, entry.card),
									})}
									onclick={() => onpay(entry)}>
									{tr("owed.pay")} {cardName(entry.card.id, entry.card)}
								</button>
							{/each}
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

	.owed-days :global(.a-wrap) {
		--a-lead-inline: calc(var(--cc-space-7) + var(--cc-space-3));
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
