<script lang="ts">
	import type { ReadyRow } from "#lib/domain/home"
	import type { LimitGroup, OwnerRecord } from "#lib/domain/types"
	import type { CardUsage, PickSort } from "#lib/domain/usage"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import UsageSpark from "#components/atoms/UsageSpark.svelte"
	import CardTile from "#components/molecules/CardTile.svelte"
	import FilterControls from "#components/molecules/FilterControls.svelte"
	import { dayMonth } from "#lib/domain/date"
	import { formatAmount } from "#lib/domain/money"
	import { cardOwnerOf, ownerName, ownerOf } from "#lib/domain/owner"
	import { matchesCard, PICK_SORTS, sortPick } from "#lib/domain/usage"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardName } from "#lib/ui/card-label"
	import { tileTone } from "#lib/ui/card-tile"

	/**
	 * The add-a-card sheet's picker (DD-195, DD-198): the list pages' search box (`FilterControls` with
	 * no `onopen`, so no *Filter* and no sort chip), the sorts always shown under it as a filter sheet's
	 * pills (most room, least used, longest unused, longest to close, latest due; most room first), so
	 * picking one never changes the sheet's height, then every ready card
	 * as a card tile (DD-151) with its last 12 statements under it: the bars on one scale for all
	 * the cards, the 12-statement total and the day it was last used. A tap calls `onpick`. A card
	 * already on the list says so at the right of its room, with what it holds there.
	 */
	interface Props {
		rows: ReadyRow[]
		usage: Map<string, CardUsage>
		/** The stored limit groups, in order: a tile takes its group's colour. */
		groups: LimitGroup[]
		/** The stored owners, to name a holder by its record (RD-30). */
		owners?: readonly OwnerRecord[]
		/** The cards on the list: what their orders add up to, and how many there are. */
		onList: Map<string, { amount: number; orders: number }>
		onpick: (cardId: string) => void
	}

	const { rows, usage, groups, owners = [], onList, onpick }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	let query = $state("")
	let sort = $state<PickSort>("room")

	const shown = $derived(sortPick(rows, sort, usage).filter((row) => matchesCard(row.card, query)))

	/** The largest statement among every ready card, so the bars compare across tiles. */
	const max = $derived(
		Math.max(0, ...rows.flatMap((row) => usage.get(row.card.id)?.statements.map((s) => s.total) ?? [])),
	)

	/** Line 1's corner: the cardholder, and whose account a supplementary card draws on. */
	const holders = (row: ReadyRow): string => {
		const account = ownerName(ownerOf(row.room.group), owners)
		if (!row.card.supplementary) return account
		const own = cardOwnerOf(row.card, row.room.group)
		const holder = own ? ownerName(own, owners) : account
		return tr("tile.subAccount", { holder, owner: account })
	}

	const facts = (row: ReadyRow): string =>
		tr("cards.page.dates", { close: dayMonth(row.closeDate, lang), due: dayMonth(row.dueDate, lang) })

	const name = (row: ReadyRow): string =>
		tr("ready.pickName", { card: cardName(row.card.id, row.card), room: formatAmount(row.room.room) })

	const aside = (cardId: string): string | undefined => {
		const held = onList.get(cardId)
		if (!held) return undefined
		const words =
			held.amount > 0
				? tr("purchaseList.onListAmount", { amount: formatAmount(held.amount) })
				: tr("purchaseList.onList")
		return held.orders > 1 ? `${words} · ${tr("purchaseList.row.orders", { count: held.orders })}` : words
	}

	const used = (cardId: string): string => {
		const of = usage.get(cardId)
		if (!of?.lastUsed) return tr("usage.summary.never")
		return tr("usage.summary", { total: formatAmount(of.total), date: dayMonth(of.lastUsed, lang) })
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

{#if rows.length === 0}
	<div class="ready-empty" data-empty="none">
		<p>{tr("ready.empty")}</p>
		<a data-action="settings" href="/settings?panel=locations">{tr("ready.toSettings")}</a>
	</div>
{:else}
	<div class="pick">
		<FilterControls
			q={query}
			placeholder={tr("ready.search")}
			onsearch={(q: string) => {
				query = q
			}} />
		<fieldset class="filter-group">
			<legend>{tr("purchaseList.sort")}</legend>
			<div class="filter-chips">
				{#each PICK_SORTS as value (value)}
					<button
						type="button"
						data-variant="quiet"
						data-sort={value}
						aria-pressed={sort === value ? "true" : "false"}
						onclick={() => {
							sort = value
						}}>
						{tr(`purchaseList.sort.${value}`)}
					</button>
				{/each}
			</div>
		</fieldset>
		{#if shown.length === 0}
			<p class="placeholder" data-empty="no-match">{tr("ready.noMatch")}</p>
		{:else}
			<div class="tiles">
				{#each shown as row (row.card.id)}
					{@const of = usage.get(row.card.id)}
					{@const tone = tileTone(row.card, groups)}
					<CardTile
						card={row.card}
						room={row.room}
						credit={row.credit}
						{tone}
						label={name(row)}
						onclick={() => onpick(row.card.id)}
						corner={holders(row)}
						aside={aside(row.card.id)}
						facts={facts(row)}
						plainRoom>
						{#snippet foot()}
							{#if of}
								<UsageSpark usage={of} {max} {tone} />
							{/if}
							<span>{used(row.card.id)}</span>
						{/snippet}
					</CardTile>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.pick {
		display: grid;
		gap: var(--cc-space-3);
	}

	/* The search box and the sorts are app.css's `.tx-controls` and `.filter-group`. */

	.tiles {
		display: grid;
		gap: var(--cc-space-2);
	}

	/* The wide sheet holds the tiles two to a row, as Cards' grid does. */
	@media (min-width: 900px) {
		.tiles {
			grid-template-columns: repeat(auto-fill, minmax(var(--cc-tile-min), 1fr));
		}
	}

	.placeholder {
		color: var(--cc-text-muted);
	}

	.ready-empty {
		gap: var(--cc-space-2);
	}
</style>
