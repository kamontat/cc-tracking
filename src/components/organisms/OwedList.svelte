<script lang="ts">
	import type { OwedRow } from "#lib/domain/owed"
	import type { GroupRoom } from "#lib/domain/room"
	import type { CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import CardTile from "#components/molecules/CardTile.svelte"
	import { formatAmount } from "#lib/domain/money"
	import { owedLeft } from "#lib/domain/owed"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { cardLine } from "#lib/ui/card-label"
	import { tileTone } from "#lib/ui/card-tile"
	import { OWED_ADDRESS } from "#lib/ui/home-query"
	import { payTileContent, payTileName } from "#lib/ui/pay-tile"
	import { withRecord } from "#lib/ui/record-panel.svelte"

	/**
	 * Home's _Owed_ tab (RD-25), under the page's control row (its sort chip, `OwedPage`): a
	 * card list of payment tiles (DD-166), one for every card that owes. A tile opens the card's
	 * panel over the tab (`/owed?card=<id>`; a click asking for a new tab is the browser's), the open
	 * card's tile marked; _Pay_ on its last line (beside the link, not in it) hands the row to
	 * `onpay`, which opens the panel on the pay form with what is left filled in.
	 */
	interface Props {
		rows: OwedRow[]
		/** The stored limit groups, in order: a tile takes its group's colour. */
		groups: LimitGroup[]
		/** Each group's room, by group id: a tile's rail shows its group's used share. */
		rooms: Map<string, GroupRoom>
		/** Each card's ledger, by card id: its open statement holds the dates line 3 shows. */
		ledgers: Map<string, CardLedger>
		/** Today, which picks a card's open period when its ledger has no open statement. */
		today: PlainDate
		/** The card open in the panel now, whose tile is marked. */
		current?: string | null
		/** A tile's plain click: open the card's panel. */
		onopencard?: (id: string) => void
		/** _Pay_ on a tile. */
		onpay?: (row: OwedRow) => void
	}

	const { rows, groups, rooms, ledgers, today, current = null, onopencard, onpay }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	/** A tile's lines and name, re-read when the language changes. */
	const content = (row: OwedRow) => {
		void lang
		return payTileContent(row, { rooms, ledgers, today })
	}
	const name = (row: OwedRow) => {
		void lang
		return payTileName(row)
	}

	/** A tile's click: the panel opens in place, unless the reader asked the browser for a new tab. */
	const opener = (id: string) => (event: MouseEvent) => {
		if (!onopencard || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
		event.preventDefault()
		onopencard(id)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<section class="owed-list">
	{#if rows.length === 0}
		<p class="empty">{tr("owed.empty")}</p>
	{:else}
		<div class="tiles">
			{#each rows as row (row.card.id)}
				<CardTile
					card={row.card}
					tone={tileTone(row.card, groups)}
					label={name(row)}
					href={withRecord(OWED_ADDRESS, { kind: "card", id: row.card.id })}
					current={row.card.id === current}
					onclick={opener(row.card.id)}
					{...content(row)}>
					{#snippet action()}
						<button
							type="button"
							class="pay"
							data-action="pay"
							aria-label={tr("owed.payName", {
								amount: formatAmount(owedLeft(row)),
								card: cardLine(row.card.id, row.card, { short: true }),
							})}
							onclick={() => onpay?.(row)}>
							{tr("owed.pay")}
						</button>
					{/snippet}
				</CardTile>
			{/each}
		</div>
	{/if}
</section>

<style>
	.owed-list {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
		min-inline-size: 0;
	}

	/* The tiles' grid: one column on a phone, as many as fit from 900px, as Ready to use. */
	.tiles {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--cc-space-2);
	}

	@media (min-width: 900px) {
		.owed-list .tiles {
			grid-template-columns: repeat(auto-fill, minmax(var(--cc-tile-min), 1fr));
		}
	}

	/* Two classes, to outrank app.css's `.page button`: a compact primary button on the tile. */
	.owed-list .pay {
		justify-content: center;
		padding-block: 0;
		padding-inline: var(--cc-space-3);
		font-size: var(--cc-text-sm);
	}

	.owed-list .empty {
		margin: 0;
		padding: var(--cc-space-4);
		color: var(--cc-text-muted);
		text-align: center;
		background: var(--cc-surface);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}
</style>
