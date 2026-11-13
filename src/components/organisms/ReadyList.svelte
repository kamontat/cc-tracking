<script lang="ts">
	import type { Sectioned } from "#lib/domain/cards-view"
	import type { ReadyRow } from "#lib/domain/home"
	import type { LimitGroup, LocationRecord, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import CardSections from "#components/molecules/CardSections.svelte"
	import CardTile from "#components/molecules/CardTile.svelte"
	import { displayDate } from "#lib/domain/date"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { lastFour, tileTone } from "#lib/ui/card-tile"
	import { READY_ADDRESS } from "#lib/ui/home-query"
	import { withRecord } from "#lib/ui/record-panel.svelte"

	/**
	 * Home's _Ready to use_ tab (RD-22), under the page's control row (`ReadyPage`): every ready card
	 * that matches, in the page's sort (most room, longest to close, latest due, either way, DD-193),
	 * in Cards' sections (`CardSections`) or, not grouped, under the count and places as Cards'
	 * result line; with none matching it says so as Cards does. Each is a card tile (DD-151) that
	 * opens the card's panel over the tab (`/ready?card=<id>`; a click asking for a new tab is the
	 * browser's), the open card's tile marked. With no card ready it says so and leads to Settings.
	 */
	interface Props {
		/** The ready cards on show, sorted, flat or sectioned. */
		results: Sectioned<ReadyRow>
		/** How many cards are ready at all, to tell "none ready" from "none match". */
		total: number
		/** The shown names of the places that take purchases, already in order. */
		places: string[]
		/** The stored limit groups, in order: a card's tile takes its group's colour. */
		groups: LimitGroup[]
		/** The stored locations: each place section's name. */
		locations?: LocationRecord[]
		/** Kept for the page's clock; the tiles' dates come with the rows. */
		today: PlainDate
		/** The card open in the panel now, whose tile is marked. */
		current?: string | null
		/** A tile's plain click: open the card's panel. */
		onopencard?: (id: string) => void
	}

	const { results, total, places, groups, locations = [], current = null, onopencard }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const count = $derived(results.count)
	const head = $derived(
		tr(count === 1 ? "ready.summary.one" : "ready.summary.many", { count, places: places.join(", ") }),
	)

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

{#snippet tile(row: ReadyRow)}
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
{/snippet}

<div class="ready">
	{#if total === 0}
		<section>
			<p class="result-head">{head}</p>
			<div class="note">
				<p>{tr("ready.empty")}</p>
				<p>{tr("quickAdd.noEligible")}</p>
				<a data-action="settings" href="/settings/locations">{tr("ready.toSettings")}</a>
			</div>
		</section>
	{:else if count === 0}
		<p class="empty">{tr("cards.page.noMatch")}</p>
	{:else}
		<div class="results" id="ready-list">
			<CardSections
				{results}
				cardOf={(row: ReadyRow) => row.card}
				{locations}
				head={results.flat ? head : undefined}
				{tile} />
		</div>
	{/if}
</div>

<style>
	/* The list's column, spaced as Cards' (`CardsList`): the sections, then the note. */
	.ready,
	.ready .results {
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

	.ready .empty {
		margin: 0;
		padding: var(--cc-space-4);
		color: var(--cc-text-muted);
		text-align: center;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}
</style>
