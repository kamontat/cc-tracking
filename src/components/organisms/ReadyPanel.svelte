<script lang="ts" module>
	/** How many cards Home shows before *See more*. */
	export const READY_TOP = 4
</script>

<script lang="ts">
	import type { ReadyRow } from "#lib/domain/home"
	import type { LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import CardTile from "#components/molecules/CardTile.svelte"
	import { displayDate } from "#lib/domain/date"
	import { sortReady } from "#lib/domain/home"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { lastFour, tileTone } from "#lib/ui/card-tile"

	/**
	 * Home's short *Ready to use* (DD-103): the count, the four cards with the most room as card
	 * tiles that open the card's page (DD-151), then *See more (N)* (the control *Needs you* uses),
	 * which opens the rest in place and reads *Show less* to fold them. Starting a list is the
	 * *+ New* menu's job and `/list/new`'s. With no card ready it says so and leads to Settings.
	 */
	interface Props {
		rows: ReadyRow[]
		/** The shown names of the places that take purchases, already in order. */
		places: string[]
		/** The stored limit groups, in order: a card's tile takes its group's colour. */
		groups: LimitGroup[]
		/** Kept for the page's clock; the tiles' dates come with the rows. */
		today: PlainDate
		/** How many unarchived cards that could take a purchase point at no limit group. */
		unassigned: number
	}

	const { rows, places, groups, unassigned }: Props = $props()

	/** Whether the cards past the first `READY_TOP` are open. */
	let expanded = $state(false)

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const count = $derived(rows.length)
	const sorted = $derived(sortReady(rows, "room"))
	const shown = $derived(expanded ? sorted : sorted.slice(0, READY_TOP))

	/** Line 3: when the card closes, or, between a bill's close and its due date, when it is due. */
	const facts = (row: ReadyRow): string =>
		row.billDue
			? tr("tile.due", { date: displayDate(row.billDue, lang) })
			: tr("tile.closes", { date: displayDate(row.closeDate, lang) })

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="ready">
	<div class="head">
		<h2>{tr("ready.title")}</h2>
		<small>{tr(count === 1 ? "ready.summary.one" : "ready.summary.many", { count, places: places.join(", ") })}</small>
	</div>
	{#if count === 0}
		<div class="note">
			<p>{tr("ready.empty")}</p>
			<p>{tr("quickAdd.noEligible")}</p>
			<a data-action="settings" href="/settings/locations">{tr("ready.toSettings")}</a>
		</div>
	{:else}
		<div class="tiles" id="ready-list">
			{#each shown as row (row.card.id)}
				<CardTile
					card={row.card}
					room={row.room}
					credit={row.credit}
					tone={tileTone(row.card, groups)}
					href={`/card?id=${encodeURIComponent(row.card.id)}`}
					corner={lastFour(row.card)}
					mono
					facts={facts(row)}
					plainRoom
					quietOver />
			{/each}
		</div>
		{#if count > READY_TOP}
			<button
				type="button"
				class="more"
				data-variant="quiet"
				data-action="more"
				aria-controls="ready-list"
				aria-expanded={expanded ? "true" : "false"}
				onclick={() => {
					expanded = !expanded
				}}>
				{expanded ? tr("common.showLess") : tr("common.seeMore", { count: count - READY_TOP })}
			</button>
		{/if}
	{/if}
	{#if unassigned > 0}
		<p class="sub" data-testid="unassigned">
			{tr(unassigned === 1 ? "spendable.unassigned.one" : "spendable.unassigned.many", { count: unassigned })}
			<a href="/cards?ungrouped=1">{tr("spendable.unassignedAction")}</a>
		</p>
	{/if}
</div>

<style>
	.ready {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
	}

	.ready .head {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--cc-space-1) var(--cc-space-3);
	}

	/* Outranks app.css's `.page h2` and `.page small`. */
	.ready .head h2 {
		font-size: var(--cc-text-2xl);
		font-weight: 700;
	}

	.ready .head small {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.ready .more {
		align-self: center;
	}

	.ready .note {
		padding: var(--cc-space-3) var(--cc-space-4);
		border-radius: var(--cc-radius-sm);
		background: var(--cc-surface-sunken);
	}

	/* The tiles' grid: one column on a phone, as many as fit from 900px. */
	.ready .tiles {
		display: grid;
		gap: var(--cc-space-2);
	}

	@media (min-width: 900px) {
		.ready .tiles {
			grid-template-columns: repeat(auto-fill, minmax(var(--cc-tile-min), 1fr));
		}
	}
</style>
