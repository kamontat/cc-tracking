<script lang="ts">
	import type { OwedDay, OwedLayout, OwedPlanView } from "#lib/domain/owed-plan"
	import type { Period } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"
	import type { Repository } from "#lib/storage/repository"
	import type { AddressBar } from "#lib/ui/address-bar"
	import type { MoneyData } from "#lib/ui/money-data"
	import type { Opened } from "#lib/ui/startup"

	import { onMount, untrack } from "svelte"

	import ErrorBanner from "#components/molecules/ErrorBanner.svelte"
	import FilterControls from "#components/molecules/FilterControls.svelte"
	import CardPanel from "#components/organisms/CardPanel.svelte"
	import OwedCalendar from "#components/organisms/OwedCalendar.svelte"
	import OwedDayPanel from "#components/organisms/OwedDayPanel.svelte"
	import OwedDays from "#components/organisms/OwedDays.svelte"
	import OwedFilter from "#components/organisms/OwedFilter.svelte"
	import { addDays, dayMonth, periodOf, today } from "#lib/domain/date"
	import { formatAmount, sumAmounts } from "#lib/domain/money"
	import {
		DEFAULT_OWED_PLAN,
		OWED_KINDS,
		OWED_LAYOUTS,
		owedEntries,
		owedMonth,
		owedMonths,
		owedPlan,
		owedSections,
		owedTotals,
	} from "#lib/domain/owed-plan"
	import { ownerName } from "#lib/domain/owner"
	import { nameOfLocation } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { browserBar } from "#lib/ui/address-bar"
	import { OWED_ADDRESS, readOwedPlan, writeOwedPlan } from "#lib/ui/home-query"
	import { loadMoneyData } from "#lib/ui/money-data"
	import { rangeWords } from "#lib/ui/owed-words"
	import { createPageState } from "#lib/ui/page-state"
	import { LATE_DAY, RecordPanel } from "#lib/ui/record-panel.svelte"
	import { whenWords } from "#lib/ui/row-text"
	import { openRepository } from "#lib/ui/startup"

	/**
	 * Home's _Owed_ tab (`/owed`, RD-25, DD-205): the money to have ready each day, so it can be
	 * moved in time. Cards' search and *Filter* (`OwedFilter`: range, places, holders, kinds; no sort,
	 * no group) and the view (calendar, by week, by month); the totals (the range, the next paying
	 * day, the next 7 days, the biggest day, and the late money while any is late); then the
	 * calendar (`OwedCalendar`) or the days in week or month sections (`OwedDays`). A day, or the
	 * late money, opens its cards in the panel (`OwedDayPanel`, `?day=`) as a list does on the Lists
	 * tab; its _Pay_ opens the card's pay form a step deeper (`?card=`, `CardPanel`). The view is in
	 * the address (`?q=&f.locations=&f.owners=&f.range=&f.shows=&view=&month=`, rewritten in place).
	 */
	interface Props {
		/** Opens the store; tests pass one over an in-memory repository. */
		open?: () => Promise<Opened>
		/** Today's date, read once. */
		clock?: () => Date
		/** The address bar; tests pass one that records and plays Back and Forward. */
		address?: AddressBar
		/** Makes a payment's id, in the card's panel. */
		newId?: () => string
	}

	const {
		open = () => openRepository(),
		clock = () => new Date(),
		address = browserBar(),
		newId = () => crypto.randomUUID(),
	}: Props = $props()

	let opening: Promise<Opened> | null = null
	const openOnce = () => {
		opening ??= open()
		return opening
	}

	/** The open card, in the address and history (RD-23). */
	const panel = untrack(() => new RecordPanel({ address, path: OWED_ADDRESS, kinds: ["card", "day"] }))

	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const now = untrack(() => today(clock()))
	let repo: Repository | null = null
	let data = $state.raw<MoneyData | null>(null)
	let state = $state.raw(untrack(() => readOwedPlan(address.search(), [])))
	let filterOpen = $state(false)
	let startupFailure = $state<(() => string) | null>(null)
	let painted = $state(0)

	const readAddress = (money: MoneyData | null) =>
		readOwedPlan(
			address.search(),
			money ? money.locations.map((record) => record.id) : [],
			money ? money.owners.map((record) => record.id) : undefined,
		)

	const page = createPageState({
		fetch: async () => {
			if (!repo) return
			const money = await loadMoneyData(repo, now)
			state = readAddress(money)
			data = money
		},
		fallbackKey: "home.error.read",
		paint: () => {
			painted++
		},
	})

	const error = $derived.by(() => {
		void lang
		void painted
		return startupFailure ? startupFailure() : page.error
	})

	const view = $derived(state.view)
	const entries = $derived(data ? owedEntries(data.cards, data.ledgers, data.payments, now) : [])
	const planFor = (v: OwedPlanView) => (data ? owedPlan(entries, data.groups, v, now) : { late: [], days: [] })
	const plan = $derived(planFor(view))
	const totals = $derived(owedTotals(plan.days, now))
	const late = $derived(sumAmounts(plan.late.map((e) => e.amount)))

	/** The day open in the panel: a date, or `late`. */
	const openDay = $derived(panel.record?.kind === "day" ? panel.record.id : null)

	// The calendar: the month in the address, else the open day's, else the next paying day's.
	const months = $derived(owedMonths(plan.days, now))
	const month = $derived.by((): Period => {
		const day = openDay && openDay !== LATE_DAY ? openDay : null
		const wanted = state.month ?? (day ? periodOf(day) : periodOf(totals.next?.date ?? now))
		return months.includes(wanted) ? wanted : (months[0] ?? periodOf(now))
	})
	const weeks = $derived(owedMonth(plan.days, month))
	const sections = $derived(view.layout === "calendar" ? [] : owedSections(plan.days, view.layout))

	const write = (next: { view?: OwedPlanView; month?: Period | null }) => {
		state = { ...state, ...next }
		address.replace(panel.keep(`${OWED_ADDRESS}${writeOwedPlan(state.view, state.month)}`))
	}

	/** Opens a day (or the late money) in the panel. */
	const openPanel = (id: string) => panel.show({ kind: "day", id })
	const change = (patch: Partial<OwedPlanView>) => write({ view: { ...view, ...patch } })

	/** The active filters as removable chips; each clears only itself. */
	const chips = $derived.by(() => {
		void lang
		const places = data?.locations ?? []
		return [
			...view.locations.map((location) => ({
				key: `loc:${location}`,
				label: nameOfLocation(places, location),
				clear: () => change({ locations: view.locations.filter((l) => l !== location) }),
			})),
			...view.owners.map((owner) => ({
				key: `owner:${owner}`,
				label: ownerName(owner, data?.owners),
				clear: () => change({ owners: view.owners.filter((o) => o !== owner) }),
			})),
			...(view.range === DEFAULT_OWED_PLAN.range
				? []
				: [{ key: "range", label: rangeWords(view.range), clear: () => change({ range: DEFAULT_OWED_PLAN.range }) }]),
			...OWED_KINDS.filter((kind) => !view.shows.includes(kind)).map((kind) => ({
				key: `kind:${kind}`,
				label: t(`owed.plan.hide.${kind}`),
				clear: () => change({ shows: OWED_KINDS.filter((k) => k === kind || view.shows.includes(k)) }),
			})),
		]
	})

	const dayWhen = (day: OwedDay | null) => {
		void lang
		return day ? tr("owed.plan.dayWhen", { date: dayMonth(day.date, getLocale()), when: whenWords(day.date, now) }) : ""
	}

	const onRetry = () => {
		if (startupFailure) location.reload()
		else void page.load()
	}

	onMount(() => {
		const unsubscribe = subscribe(() => {
			lang = getLocale()
		})
		const stopPanel = panel.start()
		const removePop = address.onPop(() => {
			state = readAddress(data)
		})
		void (async () => {
			const opened = await openOnce()
			if (!opened.ok) {
				startupFailure = opened.message
				return
			}
			repo = opened.repo
			await page.load()
		})()
		return () => {
			unsubscribe()
			removePop()
			stopPanel()
		}
	})
</script>

<div class="panel-layout" data-panel={panel.open ? "" : undefined}>
	<div class="owed-main">
		<ErrorBanner message={error} retryLabel={tr("common.reload")} onretry={onRetry} />
		{#if data}
			{#if entries.length === 0}
				<p class="empty">{tr("owed.empty")}</p>
			{:else}
				<FilterControls
					q={view.q}
					placeholder={tr("cards.searchPlaceholder")}
					onsearch={(q: string) => change({ q })}
					onopen={() => {
						filterOpen = true
					}}
					count={chips.length}
					{chips} />
				<fieldset class="filter-seg owed-layout" aria-label={tr("owed.plan.layout")}>
					{#each OWED_LAYOUTS as layout (layout)}
						<button
							type="button"
							data-layout={layout}
							aria-pressed={view.layout === layout ? "true" : "false"}
							onclick={() => write({ view: { ...view, layout: layout as OwedLayout } })}>
							{tr(`owed.plan.layout.${layout}`)}
						</button>
					{/each}
				</fieldset>
				<section class="panel owed-totals" aria-label={tr("owed.plan.totals")}>
					<div data-total="range">
						<small>{rangeWords(view.range)}</small>
						<b data-numeric>{formatAmount(totals.total)}</b>
						<span>
							{tr(totals.payingDays === 1 ? "owed.plan.days.one" : "owed.plan.days.many", {
								count: totals.payingDays,
							})}
							{#if totals.estimate > 0}
								· {tr("owed.plan.openSoFar", { amount: formatAmount(totals.estimate) })}
							{/if}
						</span>
					</div>
					<div data-total="next">
						<small>{tr("owed.plan.next")}</small>
						<b data-numeric>{totals.next ? formatAmount(totals.next.firm) : tr("common.none")}</b>
						<span>{totals.next ? dayWhen(totals.next) : tr("owed.plan.none")}</span>
					</div>
					<div data-total="week">
						<small>{tr("owed.plan.week")}</small>
						<b data-numeric>{formatAmount(totals.week)}</b>
						<span>{tr("owed.plan.weekTo", { date: dayMonth(addDays(now, 7), getLocale()) })}</span>
					</div>
					<div data-total="biggest">
						<small>{tr("owed.plan.biggest")}</small>
						<b data-numeric>{totals.biggest ? formatAmount(totals.biggest.firm) : tr("common.none")}</b>
						<span>{totals.biggest ? dayWhen(totals.biggest) : tr("owed.plan.none")}</span>
					</div>
					{#if late > 0}
						<button
							type="button"
							data-total="late"
							data-variant="quiet"
							aria-current={openDay === LATE_DAY ? "true" : undefined}
							onclick={() => openPanel(LATE_DAY)}>
							<small>{tr("owed.plan.lateTitle")}</small>
							<b data-numeric>{formatAmount(late)}</b>
							<span>{tr("owed.plan.lateNote")}</span>
						</button>
					{/if}
				</section>
				{#if plan.days.length === 0}
					<p class="empty">{tr("owed.plan.empty")}</p>
				{:else if view.layout === "calendar"}
					<OwedCalendar
						{weeks}
						{month}
						{months}
						selected={openDay}
						today={now}
						{late}
						groups={data.groups}
						onmonth={(next: Period) => write({ month: next })}
						onpick={openPanel}
						onlate={() => openPanel(LATE_DAY)} />
				{:else}
					<OwedDays {sections} by={view.layout} today={now} current={openDay} onopen={openPanel} />
				{/if}
			{/if}
			{#if filterOpen}
				<OwedFilter
					{view}
					locations={data.locations}
					owners={data.owners}
					count={(draft: OwedPlanView) => planFor(draft).days.length}
					onapply={(next: OwedPlanView) => {
						filterOpen = false
						write({ view: next })
					}}
					onclose={() => {
						filterOpen = false
					}} />
			{/if}
		{/if}
	</div>
	{#if data}
		<OwedDayPanel {panel} days={plan.days} late={plan.late} groups={data.groups} today={now} />
	{/if}
	<CardPanel {panel} open={openOnce} {clock} {newId} onchange={() => void page.load()} />
</div>

<style>
	.owed-main {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
		min-inline-size: 0;
	}

	.owed-layout {
		align-self: flex-start;
	}

	.empty {
		margin: 0;
		color: var(--cc-text-muted);
		padding: var(--cc-space-4);
		text-align: center;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	/* As many totals to a row as fit, the range's two wide; the late money wraps under them. */
	.owed-totals {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(var(--cc-total-min), 1fr));
		gap: var(--cc-space-4);
		padding: var(--cc-panel-padding);
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.owed-totals div,
	.owed-totals button {
		display: flex;
		flex-direction: column;
		min-inline-size: 0;
	}

	.owed-totals small {
		font-size: var(--cc-text-2xs);
		font-weight: 700;
		color: var(--cc-text-muted);
		text-transform: uppercase;
		letter-spacing: var(--cc-tracking-caps);
	}

	.owed-totals b {
		font-size: var(--cc-text-lg);
		font-weight: 780;
	}

	.owed-totals span {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.owed-totals [data-total="range"] {
		grid-column: span 2;
	}

	.owed-totals [data-total="range"] b {
		font-size: var(--cc-text-2xl);
		line-height: var(--cc-hero-amount-leading);
	}

	.owed-totals [data-total="next"] b {
		color: var(--cc-accent);
	}

	/* The late money opens its panel: a quiet button in the danger tone, scoped twice to outrank
	   app.css's `.page button`. */
	.owed-totals button[data-total="late"] {
		align-items: flex-start;
		gap: 0;
		padding: var(--cc-space-2) var(--cc-space-3);
		font-weight: 400;
		text-align: start;
		white-space: normal;
		color: var(--cc-danger);
		background: var(--cc-danger-surface);
		border-color: transparent;
	}

	.owed-totals button[data-total="late"] small,
	.owed-totals button[data-total="late"] span {
		color: inherit;
	}

	.owed-totals button[data-total="late"][aria-current="true"] {
		box-shadow: 0 0 0 var(--cc-ring-width) var(--cc-danger);
	}
</style>
