<script lang="ts">
	import type { ReadyRow, ReadySort } from "#lib/domain/home"
	import type { SortDir } from "#lib/domain/sort"
	import type { LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import CardTile from "#components/molecules/CardTile.svelte"
	import SortBar from "#components/molecules/SortBar.svelte"
	import { displayDate } from "#lib/domain/date"
	import { READY_DIRS, READY_SORTS, sortReady } from "#lib/domain/home"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { lastFour, tileTone } from "#lib/ui/card-tile"
	import { READY_ADDRESS } from "#lib/ui/home-query"
	import { withRecord } from "#lib/ui/record-panel.svelte"

	/**
	 * Home's _Ready to use_ tab (RD-22): the count and places with the sort row (most room, longest
	 * to close, latest due, either way, DD-193), then every ready card as a card tile (DD-151) that
	 * opens the card's panel over the tab (`/ready?card=<id>`; a click asking for a new tab is the
	 * browser's), the open card's tile marked. With no card ready it says so and leads to Settings.
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
		sort: ReadySort
		dir: SortDir
		/** The reader chose a sort (in its own direction) or reversed the order. */
		onsort: (sort: ReadySort, dir: SortDir) => void
		/** The card open in the panel now, whose tile is marked. */
		current?: string | null
		/** A tile's plain click: open the card's panel. */
		onopencard?: (id: string) => void
	}

	const { rows, places, groups, unassigned, sort, dir, onsort, current = null, onopencard }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const count = $derived(rows.length)
	const sorted = $derived(sortReady(rows, sort, dir))

	/** A tile's click: the panel opens in place, unless the reader asked the browser for a new tab. */
	const opener = (id: string) => (event: MouseEvent) => {
		if (!onopencard || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
		event.preventDefault()
		onopencard(id)
	}

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
		<small>{tr(count === 1 ? "ready.summary.one" : "ready.summary.many", { count, places: places.join(", ") })}</small>
		{#if count > 0}
			<SortBar fields={READY_SORTS} defaults={READY_DIRS} initial="room" field={sort} {dir} onchange={onsort} />
		{/if}
	</div>
	{#if count === 0}
		<div class="note">
			<p>{tr("ready.empty")}</p>
			<p>{tr("quickAdd.noEligible")}</p>
			<a data-action="settings" href="/settings/locations">{tr("ready.toSettings")}</a>
		</div>
	{:else}
		<div class="tiles" id="ready-list">
			{#each sorted as row (row.card.id)}
				<CardTile
					card={row.card}
					room={row.room}
					credit={row.credit}
					tone={tileTone(row.card, groups)}
					href={withRecord(READY_ADDRESS, { kind: "card", id: row.card.id })}
					current={row.card.id === current}
					onclick={opener(row.card.id)}
					corner={lastFour(row.card)}
					mono
					facts={facts(row)}
					plainRoom
					quietOver />
			{/each}
		</div>
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
		align-items: center;
		justify-content: space-between;
		gap: var(--cc-space-1) var(--cc-space-3);
	}

	/* Outranks app.css's `.page small`. */
	.ready .head small {
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
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
