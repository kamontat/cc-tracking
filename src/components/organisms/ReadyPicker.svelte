<script lang="ts">
	import type { ReadyRow } from "#lib/domain/home"
	import type { LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import CardTile from "#components/molecules/CardTile.svelte"
	import { displayDate } from "#lib/domain/date"
	import { formatAmount } from "#lib/domain/money"
	import { cardOwnerOf, ownerOf } from "#lib/domain/owner"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardName } from "#lib/ui/card-label"
	import { tileTone } from "#lib/ui/card-tile"

	/**
	 * The new-list picker's cards (DD-103): the ready cards as given (already filtered and sorted),
	 * as card tiles (DD-151). A whole tile is the toggle, a native `<button aria-pressed>` named only
	 * by the card and its room, so a screen reader is not read the whole tile on every tab; nothing
	 * inside it is interactive. A tap calls `ontoggle` with the card. A ticked tile wears an accent
	 * outline and a filled tick.
	 */
	interface Props {
		rows: ReadyRow[]
		/** The ids of the cards ticked. */
		selected: string[]
		/** The stored limit groups, in order: a tile takes its group's colour. */
		groups: LimitGroup[]
		/** Today, as the legacy picker took it; the tiles' dates come from each row. */
		today: PlainDate
		/** A tap on a tile: the card to tick or untick. */
		ontoggle?: (cardId: string) => void
	}

	const { rows, selected, groups, ontoggle }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	/**
	 * Line 1's corner: the cardholder; for a supplementary card, the cardholder and whose account
	 * it draws on (`NT · KC's account`). A supplementary card saved without a holder names the
	 * account holder, as Cards does.
	 */
	const holders = (row: ReadyRow): string => {
		const account = ownerOf(row.room.group)
		if (!row.card.supplementary) return account
		const holder = cardOwnerOf(row.card, row.room.group) ?? account
		return tr("tile.subAccount", { holder, owner: account })
	}

	const facts = (row: ReadyRow): string =>
		tr("cards.page.dates", {
			close: displayDate(row.closeDate, lang),
			due: displayDate(row.dueDate, lang),
		})

	const name = (row: ReadyRow): string =>
		tr("ready.pickName", { card: cardName(row.card.id, row.card), room: formatAmount(row.room.room) })

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="tiles">
	{#each rows as row (row.card.id)}
		{@const on = selected.includes(row.card.id)}
		<CardTile
			card={row.card}
			room={row.room}
			credit={row.credit}
			tone={tileTone(row.card, groups)}
			pressed={on}
			label={name(row)}
			onclick={() => ontoggle?.(row.card.id)}
			corner={holders(row)}
			facts={facts(row)}
			plainRoom>
			{#snippet lead()}
				<span class="tick" aria-hidden="true">
					{#if on}
						<SvgIcon name="check" />
					{/if}
				</span>
			{/snippet}
		</CardTile>
	{/each}
</div>

<style>
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
</style>
