<script lang="ts">
	import type { CardsResults, CardsRooms } from "#lib/domain/cards-view"
	import type { Card, CardLedger, LimitGroup, LocationRecord, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import CardTile from "#components/molecules/CardTile.svelte"
	import { cardOpenDates } from "#lib/domain/cards-view"
	import { displayDate, today as todayOf } from "#lib/domain/date"
	import { takesPurchases } from "#lib/domain/locations"
	import { cardOwnerOf } from "#lib/domain/owner"
	import { nameOfLocation } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { lastFour, tileTone } from "#lib/ui/card-tile"
	import { panelOpen, rememberPanel } from "#lib/ui/panel"

	/**
	 * The Cards page's results (DD prototype `cardResults`): by place, a section per location
	 * headed by its name, its count and whether it takes purchases; under any other sort, one flat
	 * list headed by its count whose tiles also say the place. Archived matches fold at the end
	 * (`cc:panel:cards-archive`). Each card is a card tile (DD-151) that opens its card page: the
	 * last 4, the group's room and its word, the cardholder (`· Sub` for a supplementary card),
	 * and the open period's dates.
	 */
	interface Props {
		results?: CardsResults
		/** The stored limit groups, in order: a tile takes its group's colour. */
		groups?: LimitGroup[]
		rooms?: CardsRooms
		/** The credit each card holds, in satang, keyed by card id; none when absent. */
		credits?: Map<string, number>
		/** Each card's ledger, keyed by card id: its open statement holds the dates to show. */
		ledgers?: Map<string, CardLedger>
		/** The stored locations: each section's name, and whether it takes purchases. */
		locations?: LocationRecord[]
		/** How many cards are stored at all, to tell "none yet" from "none match". */
		total?: number
		/** Today, which picks each card's open period for the tile's close and due dates. */
		today?: PlainDate
	}

	const {
		results = { sections: [], flat: null, archived: [], count: 0 },
		groups = [],
		rooms = new Map(),
		credits = new Map(),
		ledgers = new Map(),
		locations = [],
		total = 0,
		today = todayOf(new Date()),
	}: Props = $props()

	const ARCHIVE_PANEL = "cards-archive"

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const cardsCount = (count: number) =>
		count === 1 ? tr("cards.page.count.one") : tr("cards.page.count.many", { count })

	const placeName = (id: string) => {
		void lang
		return nameOfLocation(locations, id)
	}

	/** Line 3: the open period's close and due dates; the ledger's kept dates win over the cycle's. */
	const dates = (card: Card): string => {
		const { closeDate, dueDate } = cardOpenDates(card, today, ledgers.get(card.id))
		const locale = lang
		return tr("cards.page.dates", {
			close: displayDate(closeDate, locale),
			due: displayDate(dueDate, locale),
		})
	}

	/** Line 2's aside: the cardholder, then `· Sub` for a supplementary card. */
	const holder = (card: Card): string => {
		const group = groups.find((g) => g.id === card.limitGroupId) ?? null
		const owner = cardOwnerOf(card, group) ?? ""
		return card.supplementary ? [owner, tr("tile.sub")].filter(Boolean).join(" · ") : owner
	}

	const facts = (card: Card, flat: boolean): string => {
		const place = flat ? placeName(card.location) : ""
		return place ? `${dates(card)} · ${place}` : dates(card)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#snippet tiles(cards: Card[], flat: boolean)}
	<div class="tiles">
		{#each cards as card (card.id)}
			<CardTile
				{card}
				href={`/card?id=${encodeURIComponent(card.id)}`}
				tone={tileTone(card, groups)}
				room={(card.limitGroupId ? rooms.get(card.limitGroupId) : null) ?? null}
				credit={credits.get(card.id) ?? 0}
				corner={lastFour(card)}
				mono
				aside={holder(card)}
				facts={facts(card, flat)} />
		{/each}
	</div>
{/snippet}

<div class="cards-list">
	{#if results.count === 0}
		<p class="empty">{total === 0 ? tr("cards.page.empty") : tr("cards.page.noMatch")}</p>
	{/if}
	{#each results.sections ?? [] as { location, cards } (location)}
		<section data-location={location}>
			<h2 class="place">
				<b>{placeName(location)}</b>
				<small
					>{cardsCount(cards.length)}{takesPurchases(locations, location)
						? ` · ${tr("cards.page.takesPurchases")}`
						: ""}</small
				>
			</h2>
			{@render tiles(cards, false)}
		</section>
	{/each}
	{#if results.flat && results.flat.length > 0}
		<section>
			<p class="result-head">{cardsCount(results.flat.length)}</p>
			{@render tiles(results.flat, true)}
		</section>
	{/if}
	{#if results.archived.length > 0}
		<details class="archive" open={panelOpen(ARCHIVE_PANEL, false)} ontoggle={rememberPanel(ARCHIVE_PANEL)}>
			<summary>{tr("cards.archivedList", { count: results.archived.length })}</summary>
			{@render tiles(results.archived, true)}
		</details>
	{/if}
</div>

<style>
	.cards-list {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-4);
		min-inline-size: 0;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-1);
	}

	/* The tiles' grid: one column on a phone, as many as fit from 900px. */
	.tiles {
		display: grid;
		gap: var(--cc-space-2);
	}

	@media (min-width: 900px) {
		.tiles {
			grid-template-columns: repeat(auto-fill, minmax(var(--cc-tile-min), 1fr));
		}
	}

	/* Two classes, to outrank app.css's `.page h2` and `.page small`. */
	.place {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--cc-space-2);
		margin: 0;
		font-size: var(--cc-text-md);
		font-weight: 400;
	}

	.place small,
	.result-head {
		font-size: var(--cc-text-xs);
		color: var(--cc-text-muted);
	}

	.result-head {
		margin: 0;
		font-size: var(--cc-text-sm);
	}

	details.archive {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-2);
	}

	details.archive > summary {
		font-size: var(--cc-text-sm);
		font-weight: 600;
		color: var(--cc-text-muted);
		cursor: pointer;
	}

	details.archive > summary + * {
		margin-top: var(--cc-space-2);
	}

	.empty {
		margin: 0;
		padding: var(--cc-space-4);
		color: var(--cc-text-muted);
		text-align: center;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}
</style>
