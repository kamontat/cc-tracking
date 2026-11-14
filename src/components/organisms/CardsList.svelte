<script lang="ts">
	import type { CardsResults, CardsRooms } from "#lib/domain/cards-view"
	import type { Card, CardLedger, LimitGroup, LocationRecord, OwnerRecord, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import CardSections from "#components/molecules/CardSections.svelte"
	import CardTile from "#components/molecules/CardTile.svelte"
	import { cardsGlance } from "#lib/domain/cards-glance"
	import { cardOpenDates } from "#lib/domain/cards-view"
	import { displayDate, today as todayOf } from "#lib/domain/date"
	import { formatAmount } from "#lib/domain/money"
	import { cardOwnerOf, ownerName } from "#lib/domain/owner"
	import { nameOfLocation } from "#lib/i18n/format"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { lastFour, tileTone } from "#lib/ui/card-tile"
	import { panelOpen, rememberPanel } from "#lib/ui/panel"
	import { withRecord } from "#lib/ui/record-panel.svelte"

	/**
	 * The Cards page's results (DD prototype `cardResults`), in sections (DD-192): by place, a
	 * section per location headed by its name, its count and whether it takes purchases; by account
	 * holder or limit group, a section per holder or group headed by it and its count; not grouped,
	 * one flat list headed by its count. Each section's head is followed by its totals: what its
	 * cards owe, what is due on them in 7 days and their groups' used share (DD-210). Outside the place sections the tiles also say the place. Archived matches fold at the end
	 * (`cc:panel:cards-archive`). Each card is a card tile (DD-151) that opens its card's panel (RD-23): the
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
		/** The stored owners, to name a holder by its record (RD-30). */
		owners?: OwnerRecord[]
		/** How many cards are stored at all, to tell "none yet" from "none match". */
		total?: number
		/** Today, which picks each card's open period for the tile's close and due dates. */
		today?: PlainDate
		/**
		 * Opens a card's panel in place (RD-23): a plain click on a tile calls it instead of
		 * following the link; a click with a modifier (a new tab) is left to the browser.
		 */
		onopen?: ((id: string) => void) | undefined
		/** The card open in the panel now, marked on its tile. */
		current?: string | null | undefined
	}

	const {
		results = { sections: [], flat: null, archived: [], count: 0 },
		groups = [],
		rooms = new Map(),
		credits = new Map(),
		ledgers = new Map(),
		locations = [],
		owners = [],
		total = 0,
		today = todayOf(new Date()),
		onopen,
		current = null,
	}: Props = $props()

	const ARCHIVE_PANEL = "cards-archive"

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

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
		const id = cardOwnerOf(card, group)
		const owner = id ? ownerName(id, owners) : ""
		return card.supplementary ? [owner, tr("tile.sub")].filter(Boolean).join(" · ") : owner
	}

	const cardsCount = (count: number) =>
		count === 1 ? tr("cards.page.count.one") : tr("cards.page.count.many", { count })

	/** Line 3, with the place when no section head names it. */
	const facts = (card: Card, unplaced: boolean): string => {
		const place = unplaced ? placeName(card.location) : ""
		return place ? `${dates(card)} · ${place}` : dates(card)
	}

	/** A section's totals line, as the glance panels count them. */
	const totals = (cards: Card[]): string => {
		const glance = cardsGlance(cards, rooms, ledgers, today)
		return tr("cards.glance.section", {
			owed: formatAmount(glance.owed),
			soon: formatAmount(glance.soon.amount),
			used: glance.usedPct === null ? "—" : `${glance.usedPct}%`,
		})
	}

	/** A tile's click: the panel opens in place, unless the reader asked the browser for a new tab. */
	const opener = (id: string) => (event: MouseEvent) => {
		if (!onopen || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
		event.preventDefault()
		onopen(id)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#snippet summary(cards: Card[])}
	{totals(cards)}
{/snippet}

{#snippet tile(card: Card, unplaced: boolean)}
	<CardTile
		{card}
		href={withRecord("/cards", { kind: "card", id: card.id })}
		current={card.id === current}
		onclick={opener(card.id)}
		tone={tileTone(card, groups)}
		room={(card.limitGroupId ? rooms.get(card.limitGroupId) : null) ?? null}
		credit={credits.get(card.id) ?? 0}
		corner={lastFour(card)}
		mono
		aside={holder(card)}
		facts={facts(card, unplaced)} />
{/snippet}

<div class="cards-list">
	{#if results.count === 0}
		<p class="empty">{total === 0 ? tr("cards.page.empty") : tr("cards.page.noMatch")}</p>
	{/if}
	<CardSections
		{results}
		cardOf={(card: Card) => card}
		{locations}
		{owners}
		head={results.flat ? cardsCount(results.flat.length) : undefined}
		{tile}
		{summary} />
	{#if results.archived.length > 0}
		<details class="archive" open={panelOpen(ARCHIVE_PANEL, false)} ontoggle={rememberPanel(ARCHIVE_PANEL)}>
			<summary>{tr("cards.archivedList", { count: results.archived.length })}</summary>
			<CardSections
				results={{ sections: null, flat: results.archived, count: results.archived.length }}
				cardOf={(card: Card) => card}
				{locations}
				{owners}
				{tile} />
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

	details.archive > summary + :global(*) {
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
