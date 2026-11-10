<script lang="ts">
	import type { PayChoice } from "#lib/domain/pay"
	import type { GroupRoom } from "#lib/domain/room"
	import type { SortDir } from "#lib/domain/sort"
	import type { CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import CardTile from "#components/molecules/CardTile.svelte"
	import { OWED_DIRS, OWED_SORTS, type OwedSort } from "#lib/domain/transactions"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { tileTone } from "#lib/ui/card-tile"
	import { payAddress } from "#lib/ui/pay-address"
	import { payTileContent, payTileName } from "#lib/ui/pay-tile"
	import { sortFieldLabel, sortOrderLabel } from "#lib/ui/sort-label"

	/**
	 * "Owed on each card": a heading with its sort chip (the field, and a button showing which way it
	 * runs that reverses it), then a card list of payment tiles, one for
	 * every card that owes money or holds credit, each a link to the payment sheet on its card. The
	 * tile is the payment picker's (DD-166); the list is one column, since it sits in a narrow
	 * column beside the ledger from 900px and has the phone's width below it.
	 */
	interface Props {
		rows: PayChoice[]
		/** The stored limit groups, in order: a tile takes its group's colour. */
		groups: LimitGroup[]
		/** Each group's room, by group id: a tile's rail shows its group's used share. */
		rooms: Map<string, GroupRoom>
		/** Each card's ledger, by card id: its open statement holds the dates line 3 shows. */
		ledgers: Map<string, CardLedger>
		/** Today, which picks a card's open period when its ledger has no open statement. */
		today: PlainDate
		sort: OwedSort
		dir: SortDir
		/** The reader chose a sort (in its own direction) or reversed the order. */
		onsort: (sort: OwedSort, dir: SortDir) => void
	}

	const { rows, groups, rooms, ledgers, today, sort, dir, onsort }: Props = $props()

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	/** A tile's lines and name, re-read when the language changes. */
	const content = (row: PayChoice) => {
		void lang
		return payTileContent(row, { rooms, ledgers, today })
	}
	const name = (row: PayChoice) => {
		void lang
		return payTileName(row)
	}

	const fieldLabel = (option: OwedSort) => {
		void lang
		return sortFieldLabel(option)
	}
	const flipLabel = $derived.by(() => {
		void lang
		return t("sort.flip", { order: sortOrderLabel(sort, dir) })
	})

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<section class="owed-list">
	<div class="sec-head" row>
		<h2>{tr("tx.owed.title")}</h2>
		{#if rows.length}
			<div class="sort" row>
				<label class="chip" data-active={sort !== "urgency" || dir !== OWED_DIRS.urgency ? "" : undefined}>
					{tr("list.sort")}
					<select
						name="sort"
						value={sort}
						onchange={(event) => {
							const next = event.currentTarget.value as OwedSort
							onsort(next, OWED_DIRS[next])
						}}>
						{#each OWED_SORTS as option (option)}
							<option value={option}>{fieldLabel(option)}</option>
						{/each}
					</select>
				</label>
				<button
					type="button"
					class="flip"
					data-variant="quiet"
					data-action="flip-sort"
					aria-label={flipLabel}
					title={flipLabel}
					onclick={() => onsort(sort, dir === "asc" ? "desc" : "asc")}>
					{dir === "asc" ? "↑" : "↓"}
				</button>
			</div>
		{/if}
	</div>
	{#if rows.length === 0}
		<p class="empty">{tr("tx.owed.empty")}</p>
	{:else}
		<div class="tiles">
			{#each rows as row (row.card.id)}
				<CardTile
					card={row.card}
					tone={tileTone(row.card, groups)}
					label={name(row)}
					href={payAddress({ cardId: row.card.id })}
					{...content(row)} />
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

	.sec-head {
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--cc-space-2);
	}

	/* Two classes, to outrank app.css's page heading rules. */
	.owed-list h2 {
		margin: 0;
		font-size: var(--cc-text-lg);
		font-weight: 700;
	}

	.sort {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		gap: var(--cc-space-1);
	}

	/* The order button: as tall as the chip, its arrow centred. */
	.owed-list .flip {
		align-self: stretch;
		padding: 0 var(--cc-space-2);
		font-size: var(--cc-text-sm);
		border-radius: var(--cc-radius-md);
	}

	/* The legacy `listControls` chip: its name, then a select stripped of its own box. */
	.chip {
		display: flex;
		flex-direction: row;
		gap: var(--cc-space-1);
		align-items: center;
		padding-inline-start: var(--cc-space-3);
		color: var(--cc-text-muted);
		white-space: nowrap;
		background: var(--cc-surface-sunken);
		border: var(--cc-border-width) solid var(--cc-border);
		border-radius: var(--cc-radius-md);
	}

	.chip[data-active] {
		color: var(--cc-link);
		border-color: var(--cc-accent);
	}

	/* A select stripped of its own box, painting the chevron the legacy shadow root gave every
	   select, with a token gutter on both sides of it. background-color, not the shorthand: the
	   chevron is a background-image. */
	.owed-list .chip select {
		appearance: none;
		inline-size: auto;
		padding-block: var(--cc-space-1);
		padding-inline-start: var(--cc-space-1);
		padding-inline-end: calc(var(--cc-space-3) * 2 + var(--cc-select-chevron-size));
		font: inherit;
		font-size: var(--cc-text-sm);
		color: var(--cc-text);
		background-color: transparent;
		background-image: var(--cc-select-chevron);
		background-repeat: no-repeat;
		background-position: right var(--cc-space-3) center;
		background-size: var(--cc-select-chevron-size);
		border: 0;
	}

	/* One column at every width: the side column is narrow, a phone narrower. */
	.tiles {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--cc-space-2);
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
