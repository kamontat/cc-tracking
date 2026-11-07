<script lang="ts">
	import type { PayChoice } from "#lib/domain/pay"
	import type { GroupRoom } from "#lib/domain/room"
	import type { CardLedger, LimitGroup, PlainDate } from "#lib/domain/types"
	import type { MessageKey, Params } from "#lib/i18n/index"

	import { onMount } from "svelte"

	import SvgIcon from "#components/atoms/SvgIcon.svelte"
	import CardTile from "#components/molecules/CardTile.svelte"
	import { today as todayOf } from "#lib/domain/date"
	import { matchesCard } from "#lib/domain/pay"
	import { getLocale, subscribe, t } from "#lib/i18n/index"
	import { tileTone } from "#lib/ui/card-tile"
	import { payTileContent, payTileName } from "#lib/ui/pay-tile"

	/**
	 * The payment sheet's first step: every card a payment can go to, most pressing first, with a
	 * search box, as card tiles (DD-151, DD-166). A whole tile is one `<button>` named only by the
	 * card and what it owes; a tap calls `onpick` with its card, and the sheet then shows the form.
	 */
	interface Props {
		choices?: PayChoice[]
		/** The stored limit groups, in order: a tile takes its group's colour. */
		groups?: LimitGroup[]
		/** Each group's room, by group id: a tile's rail shows its group's used share. */
		rooms?: Map<string, GroupRoom>
		/** Each card's ledger, by card id: its open statement holds the dates line 3 shows. */
		ledgers?: Map<string, CardLedger>
		/** Today, which picks a card's open period when its ledger has no open statement. */
		today?: PlainDate
		/** How many cards are stored, to tell "none yet" from "only archived, paid off". */
		total?: number
		/** A tap on a tile: the card the payment goes to. */
		onpick?: (detail: { cardId: string }) => void
	}

	const {
		choices = [],
		groups = [],
		rooms = new Map(),
		ledgers = new Map(),
		today = todayOf(new Date()),
		total = 0,
		onpick,
	}: Props = $props()

	let query = $state("")

	/** The reader's language; reading it makes a translation follow a switch. */
	let lang = $state(getLocale())
	const tr = (key: MessageKey, params?: Params) => {
		void lang
		return t(key, params)
	}

	const shown = $derived(choices.filter((c) => matchesCard(c.card, query)))

	/** A tile's lines and name, re-read when the language changes. */
	const content = (choice: PayChoice) => {
		void lang
		return payTileContent(choice, { rooms, ledgers, today })
	}
	const name = (choice: PayChoice) => {
		void lang
		return payTileName(choice)
	}

	/**
	 * Listens on the box itself, as the Lit template did, rather than through Svelte's delegated
	 * root listener, so an `input` that does not bubble still narrows the tiles.
	 */
	const listen = (input: HTMLInputElement) => {
		const handle = () => {
			query = input.value
		}
		input.addEventListener("input", handle)
		return () => input.removeEventListener("input", handle)
	}

	onMount(() =>
		subscribe(() => {
			lang = getLocale()
		}),
	)
</script>

<div class="pay-picker">
	{#if choices.length === 0}
		{#if total > 0}
			<p class="empty" data-empty="archived">{tr("pay.noneToPay")}</p>
		{:else}
			<p class="empty" data-empty="no-cards"><a href="/cards">{tr("pay.noCards")}</a></p>
		{/if}
	{:else}
		<p class="hint">{tr("pay.pickHint")}</p>
		<label class="search"
			><SvgIcon name="search" />
			<input
				type="search"
				name="q"
				value={query}
				aria-label={tr("pay.searchPlaceholder")}
				placeholder={tr("pay.searchPlaceholder")}
				{@attach listen}></label
		>
		{#if shown.length === 0}
			<p class="empty">{tr("pay.noMatch")}</p>
		{:else}
			<div class="tiles">
				{#each shown as choice (choice.card.id)}
					<CardTile
						card={choice.card}
						tone={tileTone(choice.card, groups)}
						label={name(choice)}
						onclick={() => onpick?.({ cardId: choice.card.id })}
						{...content(choice)} />
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.pay-picker {
		display: flex;
		flex-direction: column;
		gap: var(--cc-space-3);
	}

	/* Two classes, to outrank app.css's `.page p`. */
	.pay-picker .hint {
		margin: 0;
		font-size: var(--cc-text-sm);
		color: var(--cc-text-muted);
	}

	.search {
		position: relative;
		display: block;
	}

	.search :global(.icon) {
		position: absolute;
		inset-inline-start: var(--cc-space-3);
		inset-block-start: 50%;
		inline-size: var(--cc-icon-size-sm);
		block-size: var(--cc-icon-size-sm);
		color: var(--cc-text-muted);
		transform: translateY(-50%);
	}

	/* Scoped twice over, to outrank app.css's `.page input`. */
	.pay-picker .search input {
		box-sizing: border-box;
		inline-size: 100%;
		padding-block: var(--cc-space-3);
		padding-inline: calc(var(--cc-space-3) * 2 + var(--cc-icon-size-sm)) var(--cc-space-3);
		border-radius: var(--cc-radius-sm);
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

	.pay-picker .empty {
		margin: 0;
		padding: var(--cc-space-4);
		color: var(--cc-text-muted);
	}
</style>
