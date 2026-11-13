<script lang="ts">
	import type { ReadyRow, ReadySort } from "#lib/domain/home"
	import type { SortDir } from "#lib/domain/sort"
	import type { LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import CardTile from "#components/molecules/CardTile.svelte"
	import { displayDate } from "#lib/domain/date"
	import { sortReady } from "#lib/domain/home"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { lastFour, tileTone } from "#lib/ui/card-tile"
	import { READY_ADDRESS } from "#lib/ui/home-query"
	import { withRecord } from "#lib/ui/record-panel.svelte"

	/**
	 * Home's _Ready to use_ tab (RD-22), under the page's control row (its sort chip, `ReadyPage`):
	 * the count and places, as Cards' result line, then every ready card, in `sort` and `dir` (most
	 * room, longest to close, latest due, either way, DD-193), as a card tile (DD-151) that
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
		/** The card open in the panel now, whose tile is marked. */
		current?: string | null
		/** A tile's plain click: open the card's panel. */
		onopencard?: (id: string) => void
	}

	const { rows, places, groups, unassigned, sort, dir, current = null, onopencard }: Props = $props()

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
	<section>
		<p class="result-head">
			{tr(count === 1 ? "ready.summary.one" : "ready.summary.many", { count, places: places.join(", ") })}
		</p>
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
	</section>
	{#if unassigned > 0}
		<p class="sub" data-testid="unassigned">
			{tr(unassigned === 1 ? "spendable.unassigned.one" : "spendable.unassigned.many", { count: unassigned })}
			<a href="/cards?ungrouped=1">{tr("spendable.unassignedAction")}</a>
		</p>
	{/if}
</div>

<style>
	/* The list's column, spaced as Cards' (`CardsList`): the result line over the tiles, then the note. */
	.ready {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
		min-inline-size: 0;
	}

	.ready section {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
	}

	/* Cards' result line (*N cards*). Two classes, to outrank app.css's `.page p`. */
	.ready .result-head {
		margin: 0;
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
